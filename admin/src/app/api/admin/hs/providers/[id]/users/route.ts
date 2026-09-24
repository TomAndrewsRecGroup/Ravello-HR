import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { parseBody } from '@/lib/validation/parseBody';
import { email as emailField, optionalShortText, z } from '@/lib/validation/primitives';
import { assertBodySize } from '@/lib/http/bodySize';
import { mintAccessToken } from '@/lib/auth/accessTokens';
import { decideProviderInvite } from '@/lib/auth/providerInvitee';
import { portalUrl } from '@/lib/portalUrl';
import { sendEmail, lastEmailError, hsProviderInvitedEmail } from '@/lib/email';
import { auditLog } from '@/lib/audit';

// POST /api/admin/hs/providers/[id]/users — give someone at an external
// H&S provider a login (staff only).
//
// The role is ALWAYS hs_provider and the company ALWAYS null: nothing in
// the body can ask for more. A provider login sees only the clients its
// provider is assigned to (hs_provider_companies, migration 094), and
// the database enforces that, not this route.
//
// Service role, because creating an auth user and writing role /
// hs_provider_id are staff-only operations that 093's guard refuses to a
// session. An existing account is resolved in auth.users, never by
// profiles.email (which its owner can rewrite), and decideProviderInvite
// refuses to convert a client or staff account.

const InviteSchema = z.object({
  email:     emailField,
  full_name: optionalShortText(120),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const tooBig = assertBodySize(request, 16 * 1024);
  if (tooBig) return tooBig;

  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const rl = limiters.account.check(getUserRateLimitKey(request, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid provider id' }, { status: 400 });
  }
  const parsed = await parseBody(request, InviteSchema);
  if (!parsed.ok) return parsed.response;
  const { email, full_name } = parsed.data;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const service = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: provider, error: providerErr } = await service
    .from('hs_providers').select('id, name, active').eq('id', params.id).maybeSingle();
  if (providerErr) return NextResponse.json({ error: providerErr.message }, { status: 500 });
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  if (!provider.active) {
    return NextResponse.json({ error: 'This provider is deactivated. Reactivate it before adding logins.' }, { status: 409 });
  }

  // ── Find or create the account ──
  const findAccount = async (): Promise<string | null> => {
    const { data, error } = await service.rpc('auth_user_id_by_email', { p_email: email });
    if (error) throw new Error(`Account lookup failed: ${error.message}`);
    return (data as string | null) ?? null;
  };

  let userId: string | null;
  let isNew = false;
  try {
    userId = await findAccount();
    if (!userId) {
      const { data: created, error: createErr } = await service.auth.admin.createUser({
        email, email_confirm: true,
      });
      if (created?.user) {
        userId = created.user.id;
        isNew = true;
      } else {
        userId = await findAccount();   // lost a race with a parallel invite
        if (!userId) return NextResponse.json({ error: createErr?.message ?? 'Could not create user.' }, { status: 400 });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Account lookup failed' }, { status: 500 });
  }

  let relink = false;
  if (!isNew) {
    const [{ data: existing, error: exErr }, { data: authUser, error: authErr }] = await Promise.all([
      service.from('profiles').select('role, company_id, hs_provider_id').eq('id', userId).maybeSingle(),
      service.auth.admin.getUserById(userId),
    ]);
    if (exErr || authErr) {
      return NextResponse.json({ error: `Could not read the existing account: ${(exErr ?? authErr)!.message}` }, { status: 500 });
    }
    const decision = decideProviderInvite(
      existing ? {
        role: existing.role, companyId: existing.company_id, providerId: existing.hs_provider_id,
        neverSignedIn: !authUser?.user?.last_sign_in_at,
      } : null,
      provider.id,
    );
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
    relink = decision.relink;
  }

  // A new account's profile row was made by handle_new_user with the
  // default role; an existing one is written only while it is still a
  // provider login with no company, so a concurrent change is not
  // overwritten. company_id is set null explicitly: the shape CHECK
  // (profiles_hs_provider_shape) requires it.
  const fields: Record<string, unknown> = { role: 'hs_provider', company_id: null, hs_provider_id: provider.id };
  if (full_name) fields.full_name = full_name;
  let write = service.from('profiles').update(fields, { count: 'exact' }).eq('id', userId);
  if (!isNew) write = write.eq('role', 'hs_provider').is('company_id', null);
  const { error: writeErr, count } = await write;
  if (writeErr || !count) {
    return NextResponse.json({ error: `Could not save the login: ${writeErr?.message ?? 'account changed while inviting'}` }, { status: 500 });
  }

  // A revoked login was banned (DELETE route); giving access back lifts it.
  if (relink) {
    const { error: unbanErr } = await service.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    if (unbanErr) return NextResponse.json({ error: `Could not restore the login: ${unbanErr.message}` }, { status: 500 });
  }

  const minted = await mintAccessToken(service, userId, 'invite', auth.userId);
  if ('error' in minted) {
    return NextResponse.json({ error: `Could not create the invite link: ${minted.error}` }, { status: 500 });
  }
  const acceptUrl = `${portalUrl()}/auth/set-password?token=${minted.token}`;

  auditLog({
    action: 'hs_provider.user_invited', actor_id: auth.userId, target_id: userId, target_type: 'profile',
    metadata: { provider_id: provider.id, email, relink },
  });
  revalidatePath('/health-safety/providers');

  const sent = await sendEmail(hsProviderInvitedEmail({ to: email, providerName: provider.name, acceptUrl }));
  if (!sent) {
    const last = lastEmailError();
    return NextResponse.json({
      success: true, user_id: userId, email_sent: false,
      email_warning: last ? `Resend rejected the send (HTTP ${last.status}): ${last.message}` : 'The email could not be sent.',
      // Staff only (requireStaff above): they can pass the link on by hand.
      activate_url: acceptUrl,
    });
  }
  return NextResponse.json({ success: true, user_id: userId, email_sent: true });
}
