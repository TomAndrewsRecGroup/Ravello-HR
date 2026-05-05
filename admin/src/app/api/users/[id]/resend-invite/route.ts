import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { ROLE_LABELS } from '@/lib/ui/statusMaps';
import { sendEmail, userInvitedEmail } from '@/lib/email';

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

  // Regenerate a fresh 7-day invite token and replace the previous one.
  // We deliberately DON'T touch onboarding_completed: this endpoint
  // doubles as a "send a new login link" for already-active users, and
  // they shouldn't be forced back through the onboarding wizard just
  // because they asked for a new magic link.
  const inviteToken   = crypto.randomUUID();
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: tokenErr } = await adminClient
    .from('profiles')
    .update({
      invite_token:            inviteToken,
      invite_token_expires_at: inviteExpires,
    })
    .eq('id', userId);

  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }

  const portalUrl   = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  const activateUrl = `${portalUrl}/auth/activate?token=${inviteToken}`;

  const result = await sendEmail(userInvitedEmail({
    to:          profile.email,
    companyName: (profile as any).companies?.name ?? 'your company',
    roleLabel:   ROLE_LABELS[profile.role as string] ?? 'Team member',
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
    const reason = !process.env.RESEND_API_KEY
      ? 'RESEND_API_KEY is not set on this Vercel project. The token was regenerated but no email was sent.'
      : 'Resend rejected the send. Check the Vercel function logs for the exact error (likely an unverified from-address domain).';
    return NextResponse.json({
      success:       true,
      email_sent:    false,
      email_warning: reason,
      activate_url:  activateUrl,
    });
  }

  return NextResponse.json({ success: true, email_sent: true });
}
