import { portalUrl as portalUrlFromEnv } from '@/lib/portalUrl';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { mintAccessToken } from '@/lib/auth/accessTokens';
import { auditLog } from '@/lib/audit';
import { labelFor, ROLE_LABELS } from '@/lib/ui/statusMaps';
import { sendEmail, lastEmailError, userInvitedEmail } from '@/lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // Ceiling on a metered/outbound action. Keyed by user rather
  // than IP so one person's bulk run does not throttle the office.
  const rl = limiters.account.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const userId = params.id;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pull the existing profile + company so the new email matches what
  // the original invite would have said.
  const { data: profile, error: profErr } = await adminClient
    .from('profiles')
    .select('id, email, full_name, role, company_id, companies:company_id(name)')
    .eq('id', userId)
    .maybeSingle();

  if (profErr || !profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (!profile.email) {
    return NextResponse.json({ error: 'User has no email on file' }, { status: 400 });
  }
  if ((profile.role as string)?.startsWith('tps_')) {
    return NextResponse.json({ error: 'Cannot resend invites for Core OS 360 staff accounts' }, { status: 400 });
  }

  // A new link, stored hashed (lib/auth/accessTokens). Minting does not
  // revoke the links already sent — an account may hold several until
  // one is used — so a failed send below costs nothing, and the link we
  // hand back on failure is a real one. (It used to be a token that was
  // never persisted: a dead link, handed to staff to forward.)
  const minted = await mintAccessToken(adminClient, userId, 'invite', auth.userId);
  if ('error' in minted) {
    return NextResponse.json({ error: `Could not create the invite link: ${minted.error}` }, { status: 500 });
  }
  const inviteToken = minted.token;

  const portalUrl = portalUrlFromEnv();
  const activateUrl = `${portalUrl}/auth/set-password?token=${inviteToken}`;

  const result = await sendEmail(userInvitedEmail({
    to:          profile.email,
    companyName: (profile as any).companies?.name ?? 'your company',
    roleLabel:   labelFor(ROLE_LABELS, profile.role as string, 'Team member'),
    acceptUrl:   activateUrl,
  }));

  auditLog({
    action:      'user.invite_resent',
    actor_id:    auth.userId,
    target_id:   userId,
    target_type: 'profile',
    metadata:    { email: profile.email, email_sent: !!result },
  });

  if (!result) {
    const last = lastEmailError();
    const reason = !process.env.RESEND_API_KEY
      ? 'RESEND_API_KEY is not set on this Vercel project. No email was sent. The link below works, and so does any earlier one.'
      : last
        ? `Resend rejected the send (HTTP ${last.status}) from "${last.from}": ${last.message}. The link below works, and so does any earlier one.`
        : 'Resend rejected the send. Check the Vercel function logs for details. The link below works, and so does any earlier one.';
    return NextResponse.json({
      success:       true,
      email_sent:    false,
      email_warning: reason,
      activate_url:  activateUrl,
    });
  }

  return NextResponse.json({ success: true, email_sent: true });
}
