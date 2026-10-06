import { NextRequest, NextResponse } from 'next/server';
import { requireLiveSession } from '@/lib/auth/liveSession';
import { isCompanySuperUser } from '@/lib/auth/companyAdmin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { mintSignatureToken } from '@/lib/documentTemplates/signatureTokens';
import { sendEmail } from '@/lib/email';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signLinkUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk').trim().replace(/\/+$/, '');
  return `${base}/sign/${token}`;
}

// POST /api/lead/document-templates/[id]/resend — Part 2, Group 6.
// The admin /resend route's exact shape: mint a NEW token, email it
// again, never touch `status`, never burn the existing link (there is
// no "one active token per instance" constraint for exactly this
// reason). A client_admin may only resend their own company's document.
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
    .select('id, company_id, employee_id, rendered_title, status').eq('id', id).maybeSingle();
  if (!instance || (!isTpsStaff && instance.company_id !== session.companyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (instance.status !== 'sent_for_signature') {
    return NextResponse.json({ error: 'This document is not currently awaiting a signature.' }, { status: 409 });
  }

  const { data: employee } = await service.from('employee_records')
    .select('full_name, email').eq('id', instance.employee_id).maybeSingle();
  if (!employee?.email) return NextResponse.json({ error: 'This employee has no email address on file.' }, { status: 400 });

  const minted = await mintSignatureToken(service, id);
  if ('error' in minted) return NextResponse.json({ error: minted.error }, { status: 500 });

  const url = signLinkUrl(minted.token);
  const html = `<p>Hello ${employee.full_name ?? ''},</p>` +
    `<p>Please review and sign: <strong>${instance.rendered_title}</strong>.</p>` +
    `<p><a href="${url}">Review and sign</a></p>` +
    `<p>This link will expire in 30 days.</p>`;
  await sendEmail({ to: employee.email, subject: `Please sign: ${instance.rendered_title}`, html, tag: 'document-sign-invite' });

  return NextResponse.json({ ok: true });
}
