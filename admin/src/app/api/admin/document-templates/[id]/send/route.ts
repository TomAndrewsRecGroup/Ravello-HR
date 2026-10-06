import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import { requireStaff } from '@/lib/auth/requireStaff';
import { serviceClient } from '@/lib/automation/runs';
import { mintSignatureToken } from '@/lib/documentTemplates/signatureTokens';
import { buildSignedDocumentPdf } from '@/lib/documentTemplates/buildSignedDocumentPdf';
import { sendEmail } from '@/lib/email';
import { portalUrl } from '@/lib/portalUrl';

export const runtime = 'nodejs';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signLinkUrl(token: string): string {
  return `${portalUrl()}/sign/${token}`;
}

// POST /api/admin/document-templates/[id]/send — Part 2, Group 5.
//
// CLAIM FIRST, work second — the exact /report/issue (Phase 7) shape:
// a conditional UPDATE matching status='draft' is the real guard
// against a double-click, so the claim happens before any email is
// sent or any file is written; a failure after the claim reverts it
// to 'draft' rather than leaving the instance stuck.
//
// A template that requires_signature mints a token and emails the
// SIGNING LINK — nothing is final yet, so no PDF is generated here;
// that happens once the recipient actually signs (/api/sign/[token]).
// A template that does NOT require a signature has nothing to sign,
// so this route finalises it directly: generates the PDF now, stores
// it, and emails the body as a plain notice.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const service = serviceClient();

  const { data: instance } = await service.from('document_instances')
    .select('id, company_id, employee_id, rendered_title, rendered_body, requires_signature, status')
    .eq('id', id).maybeSingle();
  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

  // No signature required — finalise directly.
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
