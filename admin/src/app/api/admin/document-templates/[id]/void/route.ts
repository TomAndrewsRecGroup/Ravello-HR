import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { serviceClient } from '@/lib/automation/runs';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/document-templates/[id]/void — Part 2, Group 6.
//
// Cancels a document before it has been actioned. The real guard is
// document_instances_lifecycle_guard() (215) — it refuses anything
// other than draft/sent_for_signature -> voided and stamps voided_at/
// voided_by itself, so this route only needs to ASK; the database
// decides, the same posture every H&S workflow guard in this codebase
// already takes. Counted so the UI can tell a stale status apart from
// a real database error.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const service = serviceClient();
  const { error, count } = await service.from('document_instances')
    .update({ status: 'voided' }, { count: 'exact' })
    .eq('id', id).in('status', ['draft', 'sent_for_signature']);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (count === 0) return NextResponse.json({ error: 'This document can no longer be voided — it may already have been signed, declined or voided.' }, { status: 409 });

  return NextResponse.json({ ok: true });
}
