import { NextRequest, NextResponse } from 'next/server';
import { requireLiveSession } from '@/lib/auth/liveSession';
import { isCompanySuperUser } from '@/lib/auth/companyAdmin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/lead/document-templates/[id]/void — Part 2, Group 6.
// document_instances_lifecycle_guard() (215) is the real guard — it
// refuses anything other than draft/sent_for_signature -> voided and
// stamps voided_at/voided_by itself. A client_admin may only void
// their own company's document (the RLS update policy already enforces
// this too, but the explicit company check gives a clean 404 instead
// of a generic RLS-filtered no-op).
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
    .select('id, company_id').eq('id', id).maybeSingle();
  if (!instance || (!isTpsStaff && instance.company_id !== session.companyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error, count } = await service.from('document_instances')
    .update({ status: 'voided' }, { count: 'exact' })
    .eq('id', id).in('status', ['draft', 'sent_for_signature']);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (count === 0) return NextResponse.json({ error: 'This document can no longer be voided — it may already have been signed, declined or voided.' }, { status: 409 });

  return NextResponse.json({ ok: true });
}
