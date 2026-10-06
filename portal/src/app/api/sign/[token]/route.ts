import { NextResponse, type NextRequest } from 'next/server';
import jsPDF from 'jspdf';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { normaliseAccessToken } from '@/lib/auth/accessTokens';
import { peekSignatureToken, burnSignatureTokens } from '@/lib/documentTemplates/signatureTokens';
import { buildSignedDocumentPdf } from '@/lib/documentTemplates/buildSignedDocumentPdf';
import { sendEmail } from '@/lib/email';
import { parseBody } from '@/lib/validation/parseBody';
import { z, shortText, optionalLongText } from '@/lib/validation/primitives';

// Public, token-authenticated e-signature (the employee has no login,
// by design). Same security model as /api/policy/[token]: the browser
// never talks to Supabase directly, the token (a 122-bit UUID whose
// SHA-256 is in document_signature_tokens, 213) IS the authorisation,
// and the payload is the minimum the page needs.
//
//   GET  /api/sign/{token} → the rendered document + its current status.
//   POST /api/sign/{token} → sign or decline, once; burns the token(s).
//
// CLAIM FIRST: the conditional UPDATE (status='sent_for_signature' ->
// 'signed'/'declined') is the real guard against a double-submit or a
// retried request. Only on sign is there more work after the claim
// (the final PDF) — a failure there reverts the claim, the exact
// /report/issue (Phase 7) and /document-templates/[id]/send shape.

const ipGetLimiter  = createRateLimiter({ windowMs: 5 * 60_000, max: 30 });
const ipPostLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

const InstanceSelect = 'id, company_id, employee_id, rendered_title, rendered_body, requires_signature, status, created_by, signed_at, signed_by_name, declined_at, declined_reason';

export async function GET(request: NextRequest, props: Ctx) {
  const params = await props.params;
  if (!ipGetLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!normaliseAccessToken(params.token)) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const sb = createServiceSupabaseClient();
  const peek = await peekSignatureToken(sb, params.token);
  if (peek === null) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (peek === 'expired') return NextResponse.json({ error: 'This link has expired. Ask your employer to send a new one.' }, { status: 410 });

  const [{ data: instance }] = await Promise.all([
    sb.from('document_instances').select(InstanceSelect).eq('id', peek.documentInstanceId).maybeSingle(),
  ]);
  if (!instance) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

  const [{ data: employee }, { data: company }] = await Promise.all([
    sb.from('employee_records').select('full_name').eq('id', instance.employee_id).maybeSingle(),
    sb.from('companies').select('name').eq('id', instance.company_id).maybeSingle(),
  ]);

  return NextResponse.json({
    employee: { name: employee?.full_name ?? '' },
    company: { name: company?.name ?? '' },
    document: { title: instance.rendered_title, body: instance.rendered_body },
    status: instance.status,
    signed_at: instance.signed_at,
    signed_by_name: instance.signed_by_name,
    declined_at: instance.declined_at,
  });
}

const SignBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sign'), consent: z.literal(true), signedByName: shortText(200) }),
  z.object({ action: z.literal('decline'), reason: optionalLongText(1000) }),
]);

export async function POST(request: NextRequest, props: Ctx) {
  const params = await props.params;
  if (!ipPostLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!normaliseAccessToken(params.token)) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const parsed = await parseBody(request, SignBody);
  if (!parsed.ok) return parsed.response;

  const sb = createServiceSupabaseClient();
  const peek = await peekSignatureToken(sb, params.token);
  if (peek === null) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (peek === 'expired') return NextResponse.json({ error: 'This link has expired. Ask your employer to send a new one.' }, { status: 410 });

  const { data: instance } = await sb.from('document_instances').select(InstanceSelect).eq('id', peek.documentInstanceId).maybeSingle();
  if (!instance) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (instance.status !== 'sent_for_signature') {
    // Already signed/declined/voided — not an error, just not actionable twice.
    return NextResponse.json({ ok: true, already: true, status: instance.status });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  if (parsed.data.action === 'decline') {
    const { error: claimErr, count } = await sb.from('document_instances')
      .update({ status: 'declined', declined_at: new Date().toISOString(), declined_reason: parsed.data.reason }, { count: 'exact' })
      .eq('id', instance.id).eq('status', 'sent_for_signature');
    if (claimErr || count === 0) return NextResponse.json({ error: claimErr?.message ?? 'This document has already been actioned.' }, { status: 409 });

    await burnSignatureTokens(sb, instance.id);
    await notifySender(sb, instance.id, instance.created_by, `${instance.rendered_title} was declined`,
      `<p>The document <strong>${instance.rendered_title}</strong> was declined by the employee.</p>${parsed.data.reason ? `<p>Reason given: ${parsed.data.reason}</p>` : ''}`);

    return NextResponse.json({ ok: true, status: 'declined' });
  }

  const { error: claimErr, count } = await sb.from('document_instances')
    .update({
      status: 'signed', signed_at: new Date().toISOString(), signed_by_name: parsed.data.signedByName,
      signed_ip: ip, signed_user_agent: userAgent,
    }, { count: 'exact' })
    .eq('id', instance.id).eq('status', 'sent_for_signature');
  if (claimErr || count === 0) return NextResponse.json({ error: claimErr?.message ?? 'This document has already been actioned.' }, { status: 409 });

  try {
    const signedAt = new Date().toISOString();
    const doc = buildSignedDocumentPdf(jsPDF as any, {
      title: instance.rendered_title,
      body: instance.rendered_body,
      signedByName: parsed.data.signedByName,
      signedAt,
      signedIp: ip,
      requiresSignature: true,
    });
    const bytes = (doc as any).output('arraybuffer') as ArrayBuffer;
    const path = `documents/${instance.company_id}/${Date.now()}_${instance.id}.pdf`;
    const { error: uploadErr } = await sb.storage.from('documents').upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false });
    if (uploadErr) throw new Error(`Could not store the signed document: ${uploadErr.message}`);

    const { error: pathErr, count: pathCount } = await sb.from('document_instances')
      .update({ storage_path: path }, { count: 'exact' }).eq('id', instance.id);
    if (pathErr || pathCount === 0) throw new Error(pathErr?.message ?? 'Signed but could not be linked to its file.');

    await burnSignatureTokens(sb, instance.id);
    await notifySender(sb, instance.id, instance.created_by, `${instance.rendered_title} was signed`,
      `<p>The document <strong>${instance.rendered_title}</strong> was signed by ${parsed.data.signedByName}.</p>`);

    return NextResponse.json({ ok: true, status: 'signed' });
  } catch (err) {
    await sb.from('document_instances')
      .update({ status: 'sent_for_signature', signed_at: null, signed_by_name: null, signed_ip: null, signed_user_agent: null }, { count: 'exact' })
      .eq('id', instance.id).eq('status', 'signed');
    const message = err instanceof Error ? err.message : 'Could not finalise the signature.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Best-effort: tells whoever generated the document what happened. A
 *  claim-before-send so a retried request never double-notifies. */
async function notifySender(
  sb: ReturnType<typeof createServiceSupabaseClient>, instanceId: string, createdBy: string | null, subject: string, html: string,
): Promise<void> {
  if (!createdBy) return;
  const { data: sender } = await sb.from('profiles').select('email').eq('id', createdBy).maybeSingle();
  if (!sender?.email) return;
  const dedupeKey = `document-instance-notify:${instanceId}`;
  const { error: claimErr } = await sb.from('email_log').insert({
    target_type: 'user', target_id: createdBy, company_id: null, to_email: sender.email,
    subject, body_html: '', sender_kind: 'system',
    sender_email: process.env.EMAIL_FROM ?? 'noreply@portal.thepeoplesystem.co.uk',
    sent_at: new Date().toISOString(), dedupe_key: dedupeKey,
  });
  if (claimErr) return; // already notified for this instance
  await sendEmail({ to: sender.email, subject, html, tag: 'document-instance-notify' });
}
