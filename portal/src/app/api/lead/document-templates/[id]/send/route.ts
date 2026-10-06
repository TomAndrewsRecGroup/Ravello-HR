import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import { requireLiveSession } from '@/lib/auth/liveSession';
import { isCompanySuperUser } from '@/lib/auth/companyAdmin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { mintSignatureToken } from '@/lib/documentTemplates/signatureTokens';
import { buildSignedDocumentPdf } from '@/lib/documentTemplates/buildSignedDocumentPdf';
import { sendEmail } from '@/lib/email';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signLinkUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk').trim().replace(/\/+$/, '');
  return `${base}/sign/${token}`;
}

// POST /api/lead/document-templates/[id]/send — Part 2, Group 5. The
// exact admin/api/admin/document-templates/[id]/send shape: claim
// first (a conditional UPDATE matching status='draft'), then send;
// a failure after the claim reverts it to 'draft'. A client_admin may
// only send a document for their OWN company's employee — the
// service role is the only client this table's zero session policy
// on document_signature_tokens allows, but the SESSION is still the
// real authorisation boundary here, checked before it is ever used.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const session = await requireLiveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isTpsStaff = session.role === 'tps_admin';
  if (!isCompanySuperUser({ role: session.role, isTpsStaff })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rl = limiters.email.check(getUserRateLimitKey(req, session.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const service = createServiceSupabaseClient();

  const { data: instance } = await service.from('document_instances')
    .select('id, company_id, employee_id, rendered_title, rendered_body, requires_signature, status')
    .eq('id', id).maybeSingle();
  if (!instance || (!isTpsStaff && instance.company_id !== session.companyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (instance.status !== 'draft') {
    return NextResponse.json({ error: 'This document has already been sent, signed, declined or voided.' }, { status: 409 });
  }

  const { data: employee } = await service.from('employee_records')
    .select('full_name, email').eq('id', instance.employee_id).maybeSingle();
  if (!employee?.email) return NextResponse.json({ error: 'This employee has no email address on file.' }, { status: 400 });

  if (instance.requires_signature) {
    const { error: claimErr, count } = await service.from('document_instances')
      .update({ status: 'sent_for_signature', sent_for_signature_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', id).eq('status', 'draft');
    if (claimErr || count === 0) {
      return NextResponse.json({ error: claimErr?.message ?? 'This document was already sent.' }, { status: 409 });
    }

    try {
      const minted = await mintSignatureToken(service, id);
      if ('error' in minted) throw new Error(minted.error);
      const url = signLinkUrl(minted.token);
      const html = `<p>Hello ${employee.full_name ?? ''},</p>` +
        `<p>Please review and sign: <strong>${instance.rendered_title}</strong>.</p>` +
        `<p><a href="${url}">Review and sign</a></p>` +
        `<p>This link will expire in 30 days.</p>`;
      await sendEmail({ to: employee.email, subject: `Please sign: ${instance.rendered_title}`, html, tag: 'document-sign-invite' });
      return NextResponse.json({ ok: true, status: 'sent_for_signature' });
    } catch (err) {
      await service.from('document_instances')
        .update({ status: 'draft', sent_for_signature_at: null }, { count: 'exact' })
        .eq('id', id).eq('status', 'sent_for_signature');
      const message = err instanceof Error ? err.message : 'Could not send this document.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const { error: claimErr, count } = await service.from('document_instances')
    .update({ status: 'signed', signed_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', id).eq('status', 'draft');
  if (claimErr || count === 0) {
    return NextResponse.json({ error: claimErr?.message ?? 'This document was already sent.' }, { status: 409 });
  }

  try {
    const doc = buildSignedDocumentPdf(jsPDF as any, {
      title: instance.rendered_title,
      body: instance.rendered_body,
      signedByName: null,
      signedAt: new Date().toISOString(),
      signedIp: null,
      requiresSignature: false,
    });
    const bytes = (doc as any).output('arraybuffer') as ArrayBuffer;
    const path = `documents/${instance.company_id}/${Date.now()}_${id}.pdf`;
    const { error: uploadErr } = await service.storage.from('documents').upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false });
    if (uploadErr) throw new Error(`Could not store the document: ${uploadErr.message}`);

    const { error: pathErr, count: pathCount } = await service.from('document_instances')
      .update({ storage_path: path }, { count: 'exact' }).eq('id', id);
    if (pathErr || pathCount === 0) throw new Error(pathErr?.message ?? 'Document finalised but could not be linked to its file.');

    const html = `<p>Hello ${employee.full_name ?? ''},</p><p>${instance.rendered_body.replace(/\n/g, '<br/>')}</p>`;
    await sendEmail({ to: employee.email, subject: instance.rendered_title, html, tag: 'document-notice' });

    return NextResponse.json({ ok: true, status: 'signed' });
  } catch (err) {
    await service.from('document_instances')
      .update({ status: 'draft', signed_at: null }, { count: 'exact' })
      .eq('id', id).eq('status', 'signed');
    const message = err instanceof Error ? err.message : 'Could not send this document.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
