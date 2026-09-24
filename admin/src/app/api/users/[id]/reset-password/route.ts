import { portalUrl as portalUrlFromEnv } from '@/lib/portalUrl';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { mintAccessToken } from '@/lib/auth/accessTokens';
import { auditLog } from '@/lib/audit';
import { sendEmail, lastEmailError, passwordResetEmail } from '@/lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Send a password-reset email.
 *
 * Uses the same UUID-token + on-click-magic-link middle layer as the
 * invite flow (see /auth/activate). Why: Supabase's native recovery
 * link expires 1 hour after generation, so a reset emailed Friday at
 * 5pm is dead by Saturday morning. The UUID token here lives 7 days
 * and only mints the 1-hour Supabase magic link when the recipient
 * actually clicks the link in their email.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  const { data: profile, error: profErr } = await adminClient
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (profErr || !profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (!profile.email) {
    return NextResponse.json({ error: 'User has no email on file' }, { status: 400 });
  }

  // A reset link, stored hashed (lib/auth/accessTokens). It does not
  // revoke earlier links and does not touch the current password, so a
  // failed send below costs nothing, and the link handed back on failure
  // is a real one. (It used to be an unpersisted token: a dead link.)
  const minted = await mintAccessToken(adminClient, userId, 'reset', auth.userId);
  if ('error' in minted) {
    return NextResponse.json({ error: `Could not create the reset link: ${minted.error}` }, { status: 500 });
  }
  const token = minted.token;

  // Reset uses the same direct set-password page as fresh invites
  // — both flows end with 'user types a password and is signed in'.
  // No magic-link bounce, no redirect_to allowlist dependency.
  const portalUrl = portalUrlFromEnv();
  const resetUrl  = `${portalUrl}/auth/set-password?token=${token}`;

  const result = await sendEmail(passwordResetEmail({
    to:       profile.email,
    fullName: profile.full_name ?? null,
    resetUrl,
  }));

  auditLog({
    action:      'user.password_reset_sent',
    actor_id:    auth.userId,
    target_id:   userId,
    target_type: 'profile',
    metadata:    { email: profile.email, email_sent: !!result },
  });

  if (!result) {
    const last = lastEmailError();
    const reason = !process.env.RESEND_API_KEY
      ? 'RESEND_API_KEY is not set on this Vercel project. No email was sent. The link below works; their current password is unchanged until it is used.'
      : last
        ? `Resend rejected the send (HTTP ${last.status}) from "${last.from}": ${last.message}`
        : 'Resend rejected the send. Check the Vercel function logs for details.';
    return NextResponse.json({
      success:       true,
      email_sent:    false,
      email_warning: reason,
      reset_url:     resetUrl,
    });
  }

  return NextResponse.json({ success: true, email_sent: true });
}
