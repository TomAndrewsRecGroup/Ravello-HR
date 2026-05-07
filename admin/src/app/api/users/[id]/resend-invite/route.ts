import { portalUrl as portalUrlFromEnv } from '@/lib/portalUrl';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { ROLE_LABELS } from '@/lib/ui/statusMaps';
import { sendEmail, lastEmailError, userInvitedEmail } from '@/lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return NextResponse.json({ error: 'Cannot resend invites for The People System staff accounts' }, { status: 400 });
  }

  // Mint a candidate token but DON'T persist it yet. We persist
  // (rotating away the previous valid token) only after Resend has
  // accepted the email — otherwise a Resend failure here would
  // destroy the previously-emailed token before this email arrives,
  // breaking the link the recipient still has in their inbox.
  const inviteToken   = crypto.randomUUID();
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const portalUrl = portalUrlFromEnv();
  const activateUrl = `${portalUrl}/auth/activate?token=${inviteToken}`;

  const result = await sendEmail(userInvitedEmail({
    to:          profile.email,
    companyName: (profile as any).companies?.name ?? 'your company',
    roleLabel:   ROLE_LABELS[profile.role as string] ?? 'Team member',
    acceptUrl:   activateUrl,
  }));

  // Persist the new token only on confirmed Resend acceptance. The
  // previous valid token survives any send failure so the recipient
  // can still click the link from their existing email.
  if (result) {
    const { error: tokenErr } = await adminClient
      .from('profiles')
      .update({
        invite_token:            inviteToken,
        invite_token_expires_at: inviteExpires,
      })
      .eq('id', userId);
    if (tokenErr) {
      // Email already sent but DB write failed. Surface this — the
      // operator should retry; the recipient now has a link that
      // won't validate.
      auditLog({
        action:      'user.invite_resent',
        actor_id:    auth.userId,
        target_id:   userId,
        target_type: 'profile',
        metadata:    { email: profile.email, email_sent: true, token_persist_failed: true, db_error: tokenErr.message },
      });
      return NextResponse.json({
        success:        false,
        email_sent:     true,
        email_warning:  `Email sent but token write failed: ${tokenErr.message}. Recipient's link will fail; please retry.`,
      }, { status: 500 });
    }
  }

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
      ? 'RESEND_API_KEY is not set on this Vercel project. No email was sent and the previous link (if any) is still valid.'
      : last
        ? `Resend rejected the send (HTTP ${last.status}) from "${last.from}": ${last.message}. The previous link (if any) is still valid.`
        : 'Resend rejected the send. Check the Vercel function logs for details. The previous link (if any) is still valid.';
    return NextResponse.json({
      success:       true,
      email_sent:    false,
      email_warning: reason,
      activate_url:  activateUrl,
    });
  }

  return NextResponse.json({ success: true, email_sent: true });
}
