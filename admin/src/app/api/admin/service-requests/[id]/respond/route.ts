import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { parseBody } from '@/lib/validation/parseBody';
import { longText, uuid, z } from '@/lib/validation/primitives';
import { sendEmail, lastEmailError, serviceRequestResponseEmail } from '@/lib/email';
import { portalUrl } from '@/lib/portalUrl';

// POST /api/admin/service-requests/[id]/respond
//
// Saves the staff response on a client's service request and marks it
// complete, then EMAILS the client that it has been answered.
//
// Until 2026-09-24 "Complete with response" was a bare client-side
// update: the notes were saved and the request closed, but nobody told
// the client — the serviceRequestResponse template existed and nothing
// ever called it, so a client only found out by happening to log in.
//
// Recipient: the person who raised the request (`submitted_by`); if
// that profile is gone or has no email, the company's client_admins.
// Every attempt is written to email_log, success or failure, and the
// response reports whether the email went — the request is still saved
// when the send fails, and the operator is told rather than shown a
// silent success.

const RespondSchema = z.object({
  response_notes: longText(10_000),
});

interface Ctx { params: { id: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const rl = limiters.email.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  if (!uuid.safeParse(params.id).success) {
    return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
  }

  const parsed = await parseBody(req, RespondSchema);
  if (!parsed.ok) return parsed.response;
  const responseNotes = parsed.data.response_notes.trim();
  if (!responseNotes) {
    return NextResponse.json({ error: 'Write a response before completing — it is what the client is emailed.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: request, error: readErr } = await supabase
    .from('service_requests')
    .select('id, company_id, subject, submitted_by')
    .eq('id', params.id)
    .single();
  if (readErr || !request) {
    return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
  }

  const { data: saved, error: updErr } = await supabase
    .from('service_requests')
    .update({
      response_notes: responseNotes,
      status:         'complete',
      responded_at:   new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id');
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  if (!saved?.length) {
    return NextResponse.json({ error: 'The request was not updated — it may have been deleted.' }, { status: 409 });
  }

  // Look up the company and recipients as their own queries (no embeds).
  const [{ data: company }, { data: submitter }, { data: admins }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', request.company_id).single(),
    request.submitted_by
      ? supabase.from('profiles').select('id, email').eq('id', request.submitted_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('profiles').select('id, email')
      .eq('company_id', request.company_id).eq('role', 'client_admin'),
  ]);

  const recipients: { id: string; email: string }[] =
    submitter?.email ? [{ id: submitter.id, email: submitter.email }]
    : (admins ?? []).filter(a => !!a.email).map(a => ({ id: a.id, email: a.email as string }));

  revalidatePath('/requests');

  if (recipients.length === 0) {
    return NextResponse.json({
      saved: true, emailed: 0,
      email_error: 'Saved, but this client has no user with an email address to notify.',
    });
  }

  const companyName = company?.name ?? 'your company';
  const subject = request.subject || 'Your service request';
  let emailed = 0;
  let firstError: string | null = null;

  for (const r of recipients) {
    const message = serviceRequestResponseEmail({
      to:             r.email,
      companyName,
      requestSubject: subject,
      responseNote:   responseNotes,
      supportUrl:     `${portalUrl()}/support`,
    });
    const result = await sendEmail(message);
    const errorMessage = result?.delivered ? null : (lastEmailError()?.message ?? 'Email send failed.');
    if (errorMessage) firstError ??= errorMessage; else emailed++;

    const { error: logErr } = await supabase.from('email_log').insert({
      target_type:   'company',
      target_id:     request.company_id,
      company_id:    request.company_id,
      profile_id:    r.id,
      to_email:      r.email,
      subject:       message.subject,
      body_html:     message.html,
      sender_kind:   'resend',
      sent_by:       auth.userId,
      provider_id:   result?.delivered ? result.id : null,
      error_message: errorMessage,
    });
    if (logErr) console.warn('[service-request respond] email_log insert failed', logErr.message);
  }

  return NextResponse.json({
    saved: true,
    emailed,
    email_error: emailed === recipients.length ? null
      : `Saved, but the email to the client failed: ${firstError}`,
  });
}
