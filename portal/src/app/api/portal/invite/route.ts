import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { requireLiveSession } from '@/lib/auth/liveSession';
import { sendEmail, lastEmailError, buildInviteEmail } from '@/lib/email';
import { assertBodySize } from '@/lib/http/bodySize';
import { decideExistingInvite } from '@/lib/auth/existingInvitee';
import { mintAccessToken } from '@/lib/auth/accessTokens';
import { getUserRateLimitKey, limiters, rateLimitResponse } from '@/lib/rateLimit';

const SEAT_CAP = 2;

const ROLE_LABELS: Record<string, string> = {
  client_admin:  'Admin',
  client_editor: 'Editor',
};

export async function POST(request: NextRequest) {
  try {
    const tooBig = assertBodySize(request, 64 * 1024);
    if (tooBig) return tooBig;

    // Live check, not the session cookie: this route writes with the
    // service role, so it is the only thing deciding who may invite.
    const live = await requireLiveSession();
    const user = live ? { id: live.userId } : null;
    const role = live?.role ?? '';
    const companyId = live?.companyId ?? '';

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (role !== 'client_admin') {
    return NextResponse.json({ error: 'Only the company Admin can invite team members.' }, { status: 403 });
  }
  if (!companyId) {
    return NextResponse.json({ error: 'Your account is not linked to a company.' }, { status: 400 });
  }

    // Account actions are an enumeration and mail-bombing vector.
    const rl = limiters.account.check(getUserRateLimitKey(request, live!.userId));
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    let body: { email?: string; full_name?: string } = {};
    try { body = await request.json(); } catch { /* ignore */ }
    const email     = (body.email ?? '').trim().toLowerCase();
    const full_name = (body.full_name ?? '').trim() || null;

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
      console.error('[/api/portal/invite] env missing', { hasServiceKey: !!serviceKey, hasUrl: !!supabaseUrl });
      return NextResponse.json({
        error: `Server config missing: ${!serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY ' : ''}${!supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : ''}`.trim(),
      }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  // ── Find an existing account ──────────────────────────────────
  // By auth.users email (auth_user_id_by_email, service role only), never
  // profiles.email, which any signed-in user could rewrite on their own
  // row until 2026-09-24. An existing account is never moved between
  // companies, never demoted from staff, and never handed a fresh
  // set-password link unless it is a PENDING invite in this company —
  // see lib/auth/existingInvitee.ts.
  const findAccount = async (): Promise<string | null> => {
    const { data, error } = await adminClient.rpc('auth_user_id_by_email', { p_email: email });
    if (error) throw new Error(`Account lookup failed: ${error.message}`);
    return (data as string | null) ?? null;
  };

  // ── Seat cap, counted up front ────────────────────────────────
  // So that at the cap, "that address already has an account elsewhere"
  // and "no such account" give the SAME answer — otherwise the order of
  // checks tells a client which addresses belong to other clients.
  const { count: seatCount, error: countErr } = await adminClient
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('role', ['client_admin', 'client_editor']);
  if (countErr) {
    console.error('[/api/portal/invite] seat count failed:', countErr);
    return NextResponse.json({ error: `Could not check your seat count: ${countErr.message}` }, { status: 500 });
  }
  const atCap = (seatCount ?? 0) >= SEAT_CAP;
  const seatCapResponse = () => NextResponse.json({
    error: 'You have reached your seat limit. Contact Core OS 360 to add more seats.',
    code:  'seat_cap_reached',
  }, { status: 409 });
  // One answer for every existing account a client may not invite. The
  // specific reason (staff, another client, …) is logged, never returned:
  // it would tell one client who the others are.
  const refuse = (reason: string) => {
    console.warn('[/api/portal/invite] refused existing account:', reason);
    return atCap ? seatCapResponse() : NextResponse.json({
      error: 'We could not invite that address. If they need access, contact Core OS 360.',
    }, { status: 409 });
  };

  let userId: string | null = await findAccount();
  let isNew = false;
  let inviteRole = 'client_editor';

  if (!userId) {
    if (atCap) return seatCapResponse();

    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { company_id: companyId, role: 'client_editor' },
    });
    if (createData?.user) {
      userId = createData.user.id;
      isNew  = true;
    } else {
      // Lost a race with a parallel invite: treat it as existing.
      userId = await findAccount();
      if (!userId) {
        return NextResponse.json({ error: createError?.message ?? 'Could not create user.' }, { status: 400 });
      }
    }
  }

  if (!isNew) {
    const [{ data: existing, error: existingErr }, { data: authUser, error: authErr }] = await Promise.all([
      adminClient.from('profiles').select('role, company_id').eq('id', userId).maybeSingle(),
      adminClient.auth.admin.getUserById(userId),
    ]);
    if (existingErr || authErr) {
      return NextResponse.json({ error: `Could not read the existing account: ${(existingErr ?? authErr)!.message}` }, { status: 500 });
    }
    // "Pending" means they have never signed in — not "holds a token",
    // which a staff-issued reset on an active account also does.
    const decision = decideExistingInvite(
      existing ? { role: existing.role, companyId: existing.company_id, pendingInvite: !authUser?.user?.last_sign_in_at } : null,
      companyId,
      'client_admin',
    );
    if (!decision.ok) return refuse(decision.error);
    inviteRole = existing?.role ?? inviteRole;   // a resend keeps the role they were invited with
  }

  // ── Get company name for the email ────────────────────────────
  const { data: companyRow } = await adminClient
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();

  // A new account gets its company and role here (its profile row came
  // from handle_new_user). A resend does not touch the profile at all.
  if (isNew) {
    const { error: writeErr, count: written } = await adminClient.from('profiles').upsert({
      id:                   userId,
      email,
      full_name,
      company_id:           companyId,
      role:                 'client_editor',
      onboarding_completed: false,
      onboarding_step:      0,
    }, { onConflict: 'id', count: 'exact' });
    if (writeErr || !written) {
      return NextResponse.json({ error: `Could not save the invite: ${writeErr?.message ?? 'no row written'}` }, { status: 500 });
    }
  }

  // ── 7-day set-password token, stored hashed (lib/auth/accessTokens) ──
  const minted = await mintAccessToken(adminClient, userId, 'invite', live!.userId);
  if ('error' in minted) {
    return NextResponse.json({ error: `Could not create the invite link: ${minted.error}` }, { status: 500 });
  }
  const inviteToken = minted.token;

  // ── Send branded invite email via Resend ──────────────────────
  const portalUrl   = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  const activateUrl = `${portalUrl}/auth/set-password?token=${inviteToken}`;

  const emailResult = await sendEmail(buildInviteEmail({
    to:          email,
    companyName: companyRow?.name ?? 'your company',
    roleLabel:   ROLE_LABELS[inviteRole] ?? ROLE_LABELS['client_editor'],
    activateUrl,
  }));

    // An email that did not go is an error the inviter must see. The
    // set-password link is NEVER returned to a client inviter: it would
    // let them set the password on an account in someone else's name
    // (and an email failure can be forced). Retrying is safe — the
    // account now exists, has never signed in, and is in this company,
    // so the retry takes the resend path.
    if (!emailResult) {
      const last = lastEmailError();
      console.error('[/api/portal/invite] invite email not sent', {
        to: email, status: last?.status ?? null, message: last?.message ?? (process.env.RESEND_API_KEY ? 'unknown' : 'RESEND_API_KEY unset'),
      });
      return NextResponse.json({
        error: 'The invite email could not be sent just now. Please try again in a minute, or contact Core OS 360.',
        email_sent: false,
      }, { status: 502 });
    }

    return NextResponse.json({ success: true, user_id: userId, email_sent: true });
  } catch (err) {
    console.error('[/api/portal/invite] unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
