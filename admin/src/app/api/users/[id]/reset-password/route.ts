import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
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
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

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

  // Mint a 7-day UUID token and store it on the profile. /auth/activate
  // validates and consumes this token, then generates a fresh Supabase
  // magic link at click time.
  const token   = crypto.randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: tokenErr } = await adminClient
    .from('profiles')
    .update({
      invite_token:            token,
      invite_token_expires_at: expires,
    })
    .eq('id', userId);

  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }

  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  const resetUrl  = `${portalUrl}/auth/activate?token=${token}&purpose=reset`;

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
      ? 'RESEND_API_KEY is not set on this Vercel project. The reset link was generated but no email was sent.'
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
