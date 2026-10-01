import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { loadWorkerQrStatus } from '@/lib/workforce/qrStatus';
import { parseForm } from '@/lib/validation/parseForm';
import { uuid } from '@/lib/validation/primitives';
import { uploadEvidence } from '@/lib/hs/evidence';

// Worker QR badge → attach a photo to a report just filed through
// report-incident/report-hazard, with no login. Reuses uploadEvidence()
// verbatim (the SAME helper the portal's own IncidentReportForm.tsx
// calls under a real session) — only the client passed to it differs,
// the service role here since an anonymous scan has none.
//
// The entity id is NEVER trusted bare: it must be a real incident/
// hazard row, and that row's own company_id must match the badge's
// own company — otherwise a scanner could attach evidence to another
// client's report by guessing an id. Service role bypasses RLS
// entirely, so this check is the only thing standing in for it.

const schema = z.object({
  entity_type: z.enum(['incident', 'hazard']),
  entity_id: uuid,
});

const postLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  if (!postLimiter.check(getRateLimitKey(request)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token } = await props.params;
  const service = createServiceSupabaseClient();
  const status = await loadWorkerQrStatus(service, token);
  if (!status.ok || !status.companyId) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const parsed = await parseForm(request, schema);
  if (!parsed.ok) return parsed.response;
  const { entity_type: entityType, entity_id: entityId } = parsed.data;
  const file = parsed.form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file.' }, { status: 400 });

  const table = entityType === 'incident' ? 'hs_incidents' : 'hazards';
  const { data: row } = await service.from(table).select('company_id').eq('id', entityId).maybeSingle();
  if (!row || row.company_id !== status.companyId) {
    return NextResponse.json({ error: 'That report could not be found.' }, { status: 404 });
  }

  const problem = await uploadEvidence(service, {
    companyId: status.companyId, entityType, entityId, file, evidenceType: 'photo',
  });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  return NextResponse.json({ ok: true });
}
