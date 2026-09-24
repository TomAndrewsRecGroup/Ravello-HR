import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/supabase/server';
import { sendEmail, lastEmailError, buildInviteEmail } from '@/lib/email';
import { assertBodySize } from '@/lib/http/bodySize';
import { decideExistingInvite } from '@/lib/auth/existingInvitee';

const SEAT_CAP = 2;

const ROLE_LABELS: Record<string, string> = {
  client_admin:  'Admin',
  client_editor: 'Editor',
};

export async function POST(request: NextRequest) {
  try {
    const tooBig = assertBodySize(request, 64 * 1024);
    if (tooBig) return tooBig;

    const { user, role, companyId } = await getSessionProfile();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (role !== 'client_admin') {
    return NextResponse.json({ error: 'Only the company Admin can invite team members.' }, { status: 403 });
  }
  if (!companyId) {
    return NextResponse.json({ error: 'Your account is not linked to a company.' }, { status: 400 });
  }

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

  let userId: string | null = await findAccount();
  let isNew = false;
  let inviteRole = 'client_editor';

  if (!userId) {
    // ── Seat cap (new accounts only; resending a pending invite is free) ──
    const { count: seatCount, error: countErr } = await adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('role', ['client_admin', 'client_editor']);

    if (countErr) {
      console.error('[/api/portal/invite] seat count failed:', countErr);
      return NextResponse.json({ error: `Could not check your seat count: ${countErr.message}` }, { status: 500 });
    }
    if ((seatCount ?? 0) >= SEAT_CAP) {
      return NextResponse.json({
        error: 'You have reached your seat limit. Contact Core OS 360 to add more seats.',
        code:  'seat_cap_reached',
      }, { status: 409 });
    }

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
      companyId,
      'client_admin',
    );
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
    inviteRole = existing?.role ?? inviteRole;   // a resend keeps the role they were invited with
  }

  // ── Get company name for the email ────────────────────────────
  const { data: companyRow } = await adminClient
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();

  // ── Generate 7-day invite token ───────────────────────────────
  const inviteToken   = crypto.randomUUID();
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // A new account gets its company and role here (its profile row came
  // from handle_new_user). A resend touches ONLY the token, and only
  // while the account is still in this company.
  const { error: writeErr, count: written } = isNew
    ? await adminClient.from('profiles').upsert({
        id:                      userId,
        email,
        full_name,
        company_id:              companyId,
        role:                    'client_editor',
        onboarding_completed:    false,
        onboarding_step:         0,
        invite_token:            inviteToken,
        invite_token_expires_at: inviteExpires,
      }, { onConflict: 'id', count: 'exact' })
    : await adminClient.from('profiles')
        .update({ invite_token: inviteToken, invite_token_expires_at: inviteExpires }, { count: 'exact' })
        .eq('id', userId)
        .eq('company_id', companyId);
  if (writeErr || !written) {
    return NextResponse.json({ error: `Could not save the invite: ${writeErr?.message ?? 'account changed while inviting'}` }, { status: 500 });
  }

  // ── Send branded invite email via Resend ──────────────────────
  const portalUrl   = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  const activateUrl = `${portalUrl}/auth/set-password?token=${inviteToken}`;

  const emailResult = await sendEmail(buildInviteEmail({
    to:          email,
    companyName: companyRow?.name ?? 'your company',
    roleLabel:   ROLE_LABELS[inviteRole] ?? ROLE_LABELS['client_editor'],
    activateUrl,
  }));

    // Mirror the admin route's behaviour: surface email-send failures
    // so the inviting client_admin can copy the activate_url to the
    // recipient by hand if Resend rejected the send.
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
  } catch (err) {
    console.error('[/api/portal/invite] unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
