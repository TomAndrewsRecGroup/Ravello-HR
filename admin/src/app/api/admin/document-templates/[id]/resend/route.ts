import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { serviceClient } from '@/lib/automation/runs';
import { mintSignatureToken } from '@/lib/documentTemplates/signatureTokens';
import { sendEmail } from '@/lib/email';
import { portalUrl } from '@/lib/portalUrl';

export const runtime = 'nodejs';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/document-templates/[id]/resend — Part 2, Group 6.
//
// Mints a NEW token and emails it again. Never touches `status` (the
// row is already `sent_for_signature`, so the lifecycle guard has
// nothing to do here), and never burns the existing link — signatureTokens.ts
// (Group 5) deliberately carries no "one active token per instance"
// constraint, exactly so a resend can hand the employee a fresh link
// without killing one that may still be sitting, unread, in their inbox.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const service = serviceClient();

  const { data: instance } = await service.from('document_instances')
    .select('id, employee_id, rendered_title, status').eq('id', id).maybeSingle();
  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (instance.status !== 'sent_for_signature') {
    return NextResponse.json({ error: 'This document is not currently awaiting a signature.' }, { status: 409 });
  }

  const { data: employee } = await service.from('employee_records')
    .select('full_name, email').eq('id', instance.employee_id).maybeSingle();
  if (!employee?.email) return NextResponse.json({ error: 'This employee has no email address on file.' }, { status: 400 });

  const minted = await mintSignatureToken(service, id);
  if ('error' in minted) return NextResponse.json({ error: minted.error }, { status: 500 });

  const url = `${portalUrl()}/sign/${minted.token}`;
  const html = `<p>Hello ${employee.full_name ?? ''},</p>` +
    `<p>Please review and sign: <strong>${instance.rendered_title}</strong>.</p>` +
    `<p><a href="${url}">Review and sign</a></p>` +
    `<p>This link will expire in 30 days.</p>`;
  await sendEmail({ to: employee.email, subject: `Please sign: ${instance.rendered_title}`, html, tag: 'document-sign-invite' });

  return NextResponse.json({ ok: true });
}
