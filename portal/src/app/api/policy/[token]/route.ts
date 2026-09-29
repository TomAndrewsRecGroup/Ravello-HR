import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { normaliseAccessToken } from '@/lib/auth/accessTokens';
import { peekPolicyAckToken, redeemPolicyAckToken } from '@/lib/auth/policyAckTokens';
import { signFileUrl } from '@/lib/storage/files';
import { parseBody } from '@/lib/validation/parseBody';
import { z } from '@/lib/validation/primitives';

// Public, token-authenticated policy acknowledgement (the employee has
// no login by design). Same security model as /api/leave/[token]:
//
//   GET  /api/policy/{token} → who, which document, a short-lived
//                              signed URL to read it, current status.
//   POST /api/policy/{token} → acknowledges, once; burns the links.
//
// The browser never talks to Supabase. Every read and write goes
// through the service-role client; the token (a 122-bit UUID whose
// SHA-256 is in policy_ack_tokens, 103) IS the authorisation. The
// payload is the minimum the page needs: no email, salary or notes.

const ipGetLimiter  = createRateLimiter({ windowMs: 5 * 60_000, max: 30 });
const ipPostLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

async function loadAck(sb: ReturnType<typeof createServiceSupabaseClient>, ackId: string) {
  const { data: ackRow } = await sb.from('policy_acknowledgements').select('id, company_id, document_id, hs_document_id, employee_id, status, acknowledged_at').eq('id', ackId).maybeSingle();
  const ack = ackRow as { id: string; company_id: string; document_id: string | null; hs_document_id: string | null; employee_id: string; status: string; acknowledged_at: string | null } | null;
  if (!ack) return null;
  // Exactly one of document_id (the generic documents table) / hs_document_id
  // (an hs_documents controlled-document VERSION, Core-OS 360 Phase 5
  // Group 5) is ever set — hs_documents has no file_path/file_url of
  // its own; its file rides the hs_files evidence table instead.
  const [{ data: emp }, { data: doc }, { data: hsDoc }, { data: hsFile }, { data: co }] = await Promise.all([
    sb.from('employee_records').select('full_name, status').eq('id', ack.employee_id).maybeSingle(),
    ack.document_id ? sb.from('documents').select('name, category, version, file_path, file_url').eq('id', ack.document_id).maybeSingle() : Promise.resolve({ data: null }),
    ack.hs_document_id ? sb.from('hs_documents').select('title, category, version').eq('id', ack.hs_document_id).maybeSingle() : Promise.resolve({ data: null }),
    ack.hs_document_id ? sb.from('hs_files').select('storage_path').eq('entity_type', 'document').eq('entity_id', ack.hs_document_id).order('created_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('companies').select('name').eq('id', ack.company_id).maybeSingle(),
  ]);
  const docRow = doc as { name: string; category: string; version: number; file_path: string | null; file_url: string | null } | null;
  const hsDocRow = hsDoc as { title: string; category: string; version: number } | null;
  const hsFileRow = hsFile as { storage_path: string } | null;
  const merged = docRow
    ? docRow
    : hsDocRow
      ? { name: hsDocRow.title, category: hsDocRow.category, version: hsDocRow.version, file_path: hsFileRow?.storage_path ?? null, file_url: null }
      : null;
  return { ack, emp: emp as { full_name: string; status: string } | null, doc: merged, co: co as { name: string } | null };
}

export async function GET(request: NextRequest, props: Ctx) {
  const params = await props.params;
  if (!ipGetLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!normaliseAccessToken(params.token)) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const sb = createServiceSupabaseClient();
  const peek = await peekPolicyAckToken(sb, params.token);
  if (peek === null) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (peek === 'expired') return NextResponse.json({ error: 'This link has expired. Ask your employer to send a new one.' }, { status: 410 });

  const loaded = await loadAck(sb, peek.acknowledgementId);
  if (!loaded || !loaded.emp || !loaded.doc) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (loaded.emp.status === 'terminated') return NextResponse.json({ error: 'This link is no longer active' }, { status: 410 });

  // The document itself: a signed URL for a stored file (private
  // bucket, one hour), else the external URL the row holds. An
  // hs_documents-sourced ack's file lives in hs-evidence (the register's
  // own evidence bucket), never the generic `documents` bucket.
  const bucket = loaded.ack.hs_document_id ? 'hs-evidence' : 'documents';
  const url = loaded.doc.file_path ? await signFileUrl(sb, bucket, loaded.doc.file_path) : (loaded.doc.file_url || null);

  return NextResponse.json({
    employee: { name: loaded.emp.full_name },
    company:  { name: loaded.co?.name ?? '' },
    document: { name: loaded.doc.name, category: loaded.doc.category, version: loaded.doc.version, url },
    status: loaded.ack.status,
    acknowledged_at: loaded.ack.acknowledged_at,
  });
}

export async function POST(request: NextRequest, props: Ctx) {
  const params = await props.params;
  if (!ipPostLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!normaliseAccessToken(params.token)) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const parsed = await parseBody(request, z.object({ confirmed: z.boolean() }));
  if (!parsed.ok) return parsed.response;
  if (parsed.data.confirmed !== true) return NextResponse.json({ error: 'Please tick the box to confirm you have read the document.' }, { status: 400 });

  const sb = createServiceSupabaseClient();
  const r = await redeemPolicyAckToken(sb, params.token, Date.now(), {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent'),
  });
  if (r === null) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (r === 'expired') return NextResponse.json({ error: 'This link has expired. Ask your employer to send a new one.' }, { status: 410 });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ success: true, already: r.already });
}
