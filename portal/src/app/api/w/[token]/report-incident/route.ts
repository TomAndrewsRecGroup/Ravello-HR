import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { loadWorkerQrStatus } from '@/lib/workforce/qrStatus';
import { parseBody } from '@/lib/validation/parseBody';
import { shortText, longText, optionalShortText } from '@/lib/validation/primitives';
import { HS_INCIDENT_TYPES } from '@/lib/hs/vocab';

// Worker QR badge → report an incident/near-miss with no login (closes
// a named gap: the scan page only ever showed a status + check-in/out).
// Trimmed to the same "only five things needed" shape the portal's own
// IncidentReportForm.tsx uses — type, title, what happened, and a
// location only when the worker has no site of their own.
//
// Service-role insert: the reporter has no session for RLS to evaluate
// (hs_incidents_report requires incident.create, which an anonymous
// scan can never hold) — hs_incidents_guard() already skips its own
// session-only defaulting for a service-role connection (201's own
// header comment), so company_id/occurred_on/reported_via are supplied
// here explicitly. The existing incident_reported consequence rule
// (safetyRules.ts) reacts to the row regardless of how it was
// inserted — no new notification wiring needed.
//
// Field ceilings match hs_incidents' own CHECK constraints exactly
// (title <=200, description <=4000, exact_location <=300) — the
// Phase 15 B.1 lesson: never invent a round-number ceiling unrelated
// to the column it feeds.

const schema = z.object({
  incident_type: z.enum(HS_INCIDENT_TYPES),
  title: shortText(200),
  description: longText(4000),
  location: optionalShortText(300),
});

const postLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

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

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { incident_type, title, description, location } = parsed.data;

  if (!status.siteId && !location) {
    return NextResponse.json({ error: 'Please describe where this happened.' }, { status: 400 });
  }

  const { data, error } = await service.from('hs_incidents').insert({
    company_id: status.companyId,
    site_id: status.siteId,
    exact_location: location,
    incident_type,
    title,
    description,
    occurred_on: new Date().toISOString().slice(0, 10),
    reported_by_person_id: status.personId,
    reported_via: 'qr_scan',
  }).select('id, incident_number').single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'The report was not saved. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, number: data.incident_number });
}
