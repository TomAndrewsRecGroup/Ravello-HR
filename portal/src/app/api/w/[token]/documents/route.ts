import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { loadWorkerQrStatus } from '@/lib/workforce/qrStatus';
import { HS_EVIDENCE_BUCKET } from '@/lib/hs/evidence';

// Worker QR badge → read the company's currently-effective H&S
// documents, with no login. Closes a named gap: the scan page never
// offered anything to READ, only a status. hs_documents (106/160) is
// metadata only — the file rides hs_files in the private hs-evidence
// bucket (entity_type = 'document') — so each document's latest file
// is signed here, under the SERVICE ROLE (an anonymous scan has no
// session to sign under), short-lived like every other evidence link
// in this codebase (evidenceUrl()'s own 300s precedent).
//
// `effective_from` is checked here as defence in depth, the exact
// /protect/documents precedent: the database already refuses a
// document reaching 'active' before its own effective date, so this
// is belt and braces, never the only thing enforcing it.

const getLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 30 });
const DOC_CAP = 30;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  if (!getLimiter.check(getRateLimitKey(request)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token } = await props.params;
  const service = createServiceSupabaseClient();
  const status = await loadWorkerQrStatus(service, token);
  if (!status.ok || !status.companyId) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: docs } = await service.from('hs_documents')
    .select('id, title, category')
    .eq('company_id', status.companyId).eq('status', 'active')
    .or(`effective_from.is.null,effective_from.lte.${today}`)
    .order('category').order('title').limit(DOC_CAP);

  const list = docs ?? [];
  if (list.length === 0) return NextResponse.json({ ok: true, documents: [] });

  const ids = list.map(d => d.id as string);
  const { data: files } = await service.from('hs_files')
    .select('entity_id, storage_path, created_at')
    .eq('entity_type', 'document').in('entity_id', ids)
    .order('created_at', { ascending: false }).limit(500);

  const latestPathByDoc = new Map<string, string>();
  for (const f of files ?? []) {
    const entityId = f.entity_id as string;
    if (!latestPathByDoc.has(entityId)) latestPathByDoc.set(entityId, f.storage_path as string);
  }

  const documents = await Promise.all(list.map(async d => {
    const path = latestPathByDoc.get(d.id as string);
    if (!path) return { id: d.id, title: d.title, category: d.category, url: null };
    const { data: signed } = await service.storage.from(HS_EVIDENCE_BUCKET).createSignedUrl(path, 300);
    return { id: d.id, title: d.title, category: d.category, url: signed?.signedUrl ?? null };
  }));

  return NextResponse.json({ ok: true, documents });
}
