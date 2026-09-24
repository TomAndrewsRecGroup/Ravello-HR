import { portalUrl as portalUrlFromEnv } from '@/lib/portalUrl';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { parseBody } from '@/lib/validation/parseBody';
import { email as emailField, optionalShortText, uuid, z } from '@/lib/validation/primitives';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { labelFor, PORTAL_INVITE_ROLES, ROLE_LABELS } from '@/lib/ui/statusMaps';
import { sendEmail, lastEmailError, userInvitedEmail } from '@/lib/email';
import { assertBodySize } from '@/lib/http/bodySize';
import { decideExistingInvite } from '@/lib/auth/existingInvitee';


// The role list comes from PORTAL_INVITE_ROLES rather than a literal, so
// a change to the accepted roles changes this schema too. Previously an
// unknown role silently fell back to client_admin — quietly granting
// more access than the caller asked for.
const InviteSchema = z.object({
  email:      emailField,
  company_id: uuid,
  role:       z.enum(PORTAL_INVITE_ROLES).default('client_admin'),
  full_name:  optionalShortText(120),
});

export async function POST(request: NextRequest) {
  const tooBig = assertBodySize(request, 64 * 1024);
  if (tooBig) return tooBig;

  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // Ceiling on a metered/outbound action. Keyed by user rather
  // than IP so one person's bulk run does not throttle the office.
  const rl = limiters.account.check(getUserRateLimitKey(request, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);
  const supabase = createServerSupabaseClient();

  const parsed = await parseBody(request, InviteSchema);
  if (!parsed.ok) return parsed.response;
  const { email, company_id, role, full_name } = parsed.data;

  if (!email || !company_id) {
    return NextResponse.json({ error: 'email and company_id are required' }, { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(company_id)) {
    return NextResponse.json({ error: 'Invalid company_id format' }, { status: 400 });
  }
  const { data: company, error: companyErr } = await supabase
    .from('companies').select('id, name').eq('id', company_id).single();
  if (companyErr || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const safeRole = (PORTAL_INVITE_ROLES as readonly string[]).includes(role) ? role : 'client_admin';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Find or create the account. ──
  // An existing account is found in auth.users, never by profiles.email:
  // until 2026-09-24 any signed-in user could rewrite their own
  // profiles.email to the address about to be invited, and this route
  // then upserted company_id + role onto THEIR row with the service
  // role. decideExistingInvite() refuses to move an existing account
  // between companies or out of a staff/provider role.
  //
  // createUser runs only when no account exists; if it still loses a
  // race with a parallel invite, the account it lost to is looked up
  // again and goes through the same decision.
  const normalisedEmail = email.toLowerCase().trim();
  const findAccount = async (): Promise<string | null> => {
    const { data, error } = await adminClient.rpc('auth_user_id_by_email', { p_email: normalisedEmail });
    if (error) throw new Error(`Account lookup failed: ${error.message}`);
    return (data as string | null) ?? null;
  };

  let userId: string | null;
  let isNew = false;
  try {
    userId = await findAccount();
    if (!userId) {
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email:         normalisedEmail,
        email_confirm: true,
        user_metadata: { company_id, role: safeRole },
      });
      if (createData?.user) {
        userId = createData.user.id;
        isNew  = true;
      } else {
        userId = await findAccount();
        if (!userId) {
          return NextResponse.json({ error: createError?.message ?? 'Could not create user.' }, { status: 400 });
        }
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Account lookup failed' }, { status: 500 });
  }
  if (!userId) return NextResponse.json({ error: 'Could not create user.' }, { status: 400 });

  if (!isNew) {
    const { data: existing, error: existingErr } = await adminClient
      .from('profiles')
      .select('role, company_id, invite_token')
      .eq('id', userId)
      .maybeSingle();
    if (existingErr) {
      return NextResponse.json({ error: `Could not read the existing account: ${existingErr.message}` }, { status: 500 });
    }
    const decision = decideExistingInvite(
      existing ? { role: existing.role, companyId: existing.company_id, pendingInvite: !!existing.invite_token } : null,
      company_id,
      'staff',
    );
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  // ── Generate a 7-day invite token and store it on the profile. ──
  // This replaces the 1-hour access_token that Supabase's native
  // inviteUserByEmail embeds directly in the email link. The portal's
  // /auth/activate page validates this token and generates a fresh
  // Supabase magic link on-demand, so the 1-hour window only starts
  // when the client actually clicks — not when we sent the email.
  const inviteToken   = crypto.randomUUID();
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const profileFields = {
    full_name:               full_name || null,
    role:                    safeRole,
    onboarding_completed:    false,
    onboarding_step:         1,
    invite_token:            inviteToken,
    invite_token_expires_at: inviteExpires,
  };
  // A new account's profile row was made by handle_new_user; an existing
  // one is updated only while it is still in THIS company, so a
  // concurrent move cannot be overwritten.
  const { error: writeErr, count: written } = isNew
    ? await adminClient.from('profiles').upsert(
        { id: userId, email: normalisedEmail, company_id, ...profileFields },
        { onConflict: 'id', count: 'exact' },
      )
    : await adminClient.from('profiles')
        .update({ ...profileFields, full_name: full_name || undefined }, { count: 'exact' })
        .eq('id', userId)
        .eq('company_id', company_id);
  if (writeErr || !written) {
    return NextResponse.json({ error: `Could not save the invite: ${writeErr?.message ?? 'account changed while inviting'}` }, { status: 500 });
  }

  auditLog({
    action:      'user.invited',
    actor_id:    auth.userId,
    target_id:   userId,
    target_type: 'profile',
    metadata:    { email, company_id, role: safeRole },
  });

  revalidateTag(`client:${company_id}`);
  revalidatePath('/users');
  revalidatePath('/dashboard');
  revalidatePath(`/clients/${company_id}`);

  // ── Send the branded invite email via Resend. ──
  // This is now the ONLY email the client receives — we no longer
  // rely on Supabase's native invite email (which embedded a
  // short-lived token). The link goes to /auth/activate which
  // validates the 7-day token and generates a fresh magic link.
  const portalUrl = portalUrlFromEnv();
  const activateUrl = `${portalUrl}/auth/set-password?token=${inviteToken}`;

  const emailResult = await sendEmail(userInvitedEmail({
    to:          email,
    companyName: (company as any).name ?? 'your company',
    roleLabel:   labelFor(ROLE_LABELS, safeRole, 'Admin'),
    acceptUrl:   activateUrl,
  }));

  // Surface email-send failures to the admin UI instead of swallowing
  // them. The user / profile / token are already persisted, so the
  // invite link still works — but the admin needs to know to either
  // resend it or hand the link over manually.
  if (!emailResult) {
    const last = lastEmailError();
    const reason = !process.env.RESEND_API_KEY
      ? 'RESEND_API_KEY is not set on this Vercel project. The user record was created but no email was sent.'
      : last
        ? `Resend rejected the send (HTTP ${last.status}) from "${last.from}": ${last.message}`
        : 'Resend rejected the send. Check the Vercel function logs for details.';
    return NextResponse.json({
      success:        true,
      user_id:        userId,
      email_sent:     false,
      email_warning:  reason,
      activate_url:   activateUrl,
    });
  }

  return NextResponse.json({ success: true, user_id: userId, email_sent: true });
}
