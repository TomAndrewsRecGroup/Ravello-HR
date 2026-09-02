import { NextResponse, type NextRequest } from 'next/server';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { sendEmail, lastEmailError } from '@/lib/email';
import { referralInviteEmail } from '@/lib/email/templates/referralInvite';
import { buildReferralUrl } from '@/lib/referral/referralUrl';

export const runtime = 'nodejs';

// POST /api/admin/referrals/[id]/test-email
//
// Sends the referral invite for THIS role to the signed-in staff
// member, so the operator can see exactly what a candidate receives
// before turning dry run off. It renders the real template with the
// role's real config — same code path a live send uses — rather than a
// mock, because a preview built from a copy is a preview of the copy.
//
// THE RECIPIENT IS THE SESSION'S OWN ADDRESS, NEVER THE REQUEST BODY.
// This route reads no recipient at all: it resolves the caller's email
// from their Supabase session. That is what stops a "send a test email"
// endpoint from being a general-purpose mailer sitting behind one staff
// login — the thing it can do to anybody else is nothing.
//
// It also does not touch `referral_applications`. A preview is not a
// journey: writing a row would put a real candidate id's worth of
// funnel state into the operator's own name, and the idempotency guard
// would then treat the role as already processed for that "candidate".
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // The email limiter, not the write one — this sends mail.
  const rl = limiters.email.check(getUserRateLimitKey(_req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  const to = user?.email;
  if (!to) {
    return NextResponse.json(
      { error: 'Your account has no email address on it, so there is nowhere to send the preview.' },
      { status: 400 },
    );
  }

  const [{ data: config }, { data: requisition }] = await Promise.all([
    supabase
      .from('referral_role_config')
      .select('partner_name,referral_url,email_process_note')
      .eq('requisition_id', params.id)
      .maybeSingle(),
    supabase
      .from('requisitions')
      .select('title')
      .eq('id', params.id)
      .maybeSingle(),
  ]);

  if (!config) {
    return NextResponse.json(
      { error: 'This role has no referral config saved yet — fill the panel in and save before previewing.' },
      { status: 404 },
    );
  }
  if (!config.referral_url) {
    return NextResponse.json(
      { error: 'This role has no referral URL, so the button in the email would go nowhere.' },
      { status: 400 },
    );
  }

  // Built through the real URL builder so the preview carries whatever
  // per-candidate parameters a live send would carry — a link that
  // works in the preview and 404s in production is the failure this
  // whole preview exists to catch.
  const referralUrl = buildReferralUrl(config.referral_url, {
    email: to,
    name:  user.user_metadata?.full_name ?? 'Sample Candidate',
  });

  const mail = referralInviteEmail({
    to,
    firstName:   'Sample',
    roleTitle:   requisition?.title ?? 'this role',
    referralUrl,
    processNote: config.email_process_note ?? undefined,
  });

  // Marked in the SUBJECT only. The body is sent byte-identical to what
  // a candidate gets, because the body is the thing being reviewed —
  // a banner injected into it would be reviewing a different email.
  const sent = await sendEmail({
    ...mail,
    subject: `[Preview] ${mail.subject}`,
    tag:     'referral-invite-preview',
  });

  if (!sent) {
    return NextResponse.json(
      { error: lastEmailError() ?? 'The send was rejected and no reason was reported.' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    to,
    delivered: sent.delivered,
    subject:   mail.subject,
  });
}
