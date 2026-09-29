import type { SupabaseClient } from '@supabase/supabase-js';

// Core-OS 360 Phase 5, Group 7 (migration 162): the Governance Calendar.
//
// A READ-TIME AGGREGATE, never a new events/scheduling table of its
// own — the source rows (audit_programmes, management_reviews,
// objectives, compliance_evaluations/organisation_legal_obligations,
// hs_documents, environmental_permits/permit_conditions,
// iso_certifications) remain the single source of truth; this file
// only unions their own dates into one sorted list, each row tagged
// with its own type and a link back to where it actually lives.
//
// TypeScript was chosen over a single SQL view because the six-plus
// source tables have genuinely different shapes (some date columns are
// `date`, one is `timestamptz`; "next due" sometimes needs a JOIN to
// resolve a human-readable title, e.g. a legal obligation's own
// requirement title) — a UNION ALL view doing all of that in one SQL
// statement is materially harder to read, test and extend than the
// same logic as typed TypeScript functions, and nothing here needs to
// run inside a policy or a trigger, where only SQL would do.

export type GovernanceCalendarEventType =
  | 'audit_programme'
  | 'management_review'
  | 'objective_target'
  | 'legal_obligation_review'
  | 'hs_document_review'
  | 'environmental_permit_expiry'
  | 'permit_condition_review'
  | 'iso_certification_expiry';

export interface GovernanceCalendarEvent {
  type: GovernanceCalendarEventType;
  date: string; // ISO date (yyyy-mm-dd)
  company_id: string;
  title: string;
  adminLink: string;
  portalLink: string;
}

const toDateOnly = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : null;
};

/** Every already-dated governance item for one company (or every
 *  company, when companyId is omitted — the cross-client view) between
 *  `from` and `to` (both inclusive, ISO dates). Never duplicated into a
 *  new table: each row here is read fresh from its own source table. */
export async function governanceCalendarEvents(
  sb: SupabaseClient,
  opts: { companyId?: string; from: string; to: string },
): Promise<GovernanceCalendarEvent[]> {
  const { companyId, from, to } = opts;

  let q1: any = sb.from('audit_programmes').select('id, company_id, name, next_due_date, active').eq('active', true)
    .not('next_due_date', 'is', null).gte('next_due_date', from).lte('next_due_date', to).limit(500);
  let q2: any = sb.from('management_reviews').select('id, company_id, review_date, status').eq('status', 'scheduled')
    .gte('review_date', from).lte('review_date', to).limit(500);
  let q3: any = sb.from('objectives').select('id, company_id, title, target_date, status').in('status', ['draft', 'active', 'on_track', 'at_risk'])
    .not('target_date', 'is', null).gte('target_date', from).lte('target_date', to).limit(500);
  let q4: any = sb.from('organisation_legal_obligations').select('id, company_id, legal_requirement_id, next_review_due')
    .not('next_review_due', 'is', null).gte('next_review_due', from).lte('next_review_due', to).limit(500);
  let q5: any = sb.from('hs_documents').select('id, company_id, title, review_due_at, status').eq('status', 'active')
    .not('review_due_at', 'is', null).gte('review_due_at', from).lte('review_due_at', to).limit(500);
  let q6: any = sb.from('environmental_permits').select('id, company_id, permit_number, expires_on, status').eq('status', 'active')
    .not('expires_on', 'is', null).gte('expires_on', from).lte('expires_on', to).limit(500);
  let q7: any = sb.from('permit_conditions').select('id, company_id, title, next_review_due, status').in('status', ['current', 'evidence_due'])
    .not('next_review_due', 'is', null).gte('next_review_due', from).lte('next_review_due', to).limit(500);
  let q8: any = sb.from('iso_certifications').select('id, company_id, standard_id, certificate_number, expires_on')
    .not('expires_on', 'is', null).gte('expires_on', from).lte('expires_on', to).limit(500);

  if (companyId) {
    q1 = q1.eq('company_id', companyId); q2 = q2.eq('company_id', companyId); q3 = q3.eq('company_id', companyId);
    q4 = q4.eq('company_id', companyId); q5 = q5.eq('company_id', companyId); q6 = q6.eq('company_id', companyId);
    q7 = q7.eq('company_id', companyId); q8 = q8.eq('company_id', companyId);
  }

  const [programmes, reviews, objectives, legalObligations, documents, envPermits, permitConditions, isoCerts] =
    await Promise.all([q1, q2, q3, q4, q5, q6, q7, q8]);

  const events: GovernanceCalendarEvent[] = [];

  for (const r of (programmes.data ?? []) as { id: string; company_id: string; name: string; next_due_date: string }[]) {
    const d = toDateOnly(r.next_due_date); if (!d) continue;
    events.push({ type: 'audit_programme', date: d, company_id: r.company_id, title: `Audit due: ${r.name}`,
      adminLink: `/health-safety/${r.company_id}/audits`, portalLink: '/protect/audits' });
  }
  for (const r of (reviews.data ?? []) as { id: string; company_id: string; review_date: string }[]) {
    const d = toDateOnly(r.review_date); if (!d) continue;
    events.push({ type: 'management_review', date: d, company_id: r.company_id, title: 'Management review',
      adminLink: `/health-safety/${r.company_id}/management-review`, portalLink: '/protect/management-review' });
  }
  for (const r of (objectives.data ?? []) as { id: string; company_id: string; title: string; target_date: string }[]) {
    const d = toDateOnly(r.target_date); if (!d) continue;
    events.push({ type: 'objective_target', date: d, company_id: r.company_id, title: `Objective target: ${r.title}`,
      adminLink: `/health-safety/${r.company_id}/objectives`, portalLink: '/protect/objectives' });
  }
  for (const r of (legalObligations.data ?? []) as { id: string; company_id: string; next_review_due: string }[]) {
    const d = toDateOnly(r.next_review_due); if (!d) continue;
    events.push({ type: 'legal_obligation_review', date: d, company_id: r.company_id, title: 'Legal register review due',
      adminLink: `/health-safety/${r.company_id}/legal`, portalLink: '/protect/legal-register' });
  }
  for (const r of (documents.data ?? []) as { id: string; company_id: string; title: string; review_due_at: string }[]) {
    const d = toDateOnly(r.review_due_at); if (!d) continue;
    events.push({ type: 'hs_document_review', date: d, company_id: r.company_id, title: `Document review due: ${r.title}`,
      adminLink: `/health-safety/${r.company_id}/documents`, portalLink: '/protect/documents' });
  }
  for (const r of (envPermits.data ?? []) as { id: string; company_id: string; permit_number: string | null; expires_on: string }[]) {
    const d = toDateOnly(r.expires_on); if (!d) continue;
    events.push({ type: 'environmental_permit_expiry', date: d, company_id: r.company_id, title: `Environmental permit expires${r.permit_number ? ` (${r.permit_number})` : ''}`,
      adminLink: `/health-safety/${r.company_id}/environmental-permits`, portalLink: '/protect/environmental-permits' });
  }
  for (const r of (permitConditions.data ?? []) as { id: string; company_id: string; title: string; next_review_due: string }[]) {
    const d = toDateOnly(r.next_review_due); if (!d) continue;
    events.push({ type: 'permit_condition_review', date: d, company_id: r.company_id, title: `Permit condition review: ${r.title}`,
      adminLink: `/health-safety/${r.company_id}/environmental-permits`, portalLink: '/protect/environmental-permits' });
  }
  for (const r of (isoCerts.data ?? []) as { id: string; company_id: string; certificate_number: string | null; expires_on: string }[]) {
    const d = toDateOnly(r.expires_on); if (!d) continue;
    events.push({ type: 'iso_certification_expiry', date: d, company_id: r.company_id, title: `ISO certificate expires${r.certificate_number ? ` (${r.certificate_number})` : ''}`,
      adminLink: `/health-safety/${r.company_id}/iso`, portalLink: '/protect/iso-readiness' });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  return events;
}

/** Groups a flat, sorted event list by calendar month (yyyy-mm) for a
 *  simple list-grouped-by-month rendering — no interactive calendar
 *  widget needed. */
export function groupByMonth(events: GovernanceCalendarEvent[]): { month: string; events: GovernanceCalendarEvent[] }[] {
  const map = new Map<string, GovernanceCalendarEvent[]>();
  for (const e of events) {
    const month = e.date.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(e);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, events]) => ({ month, events }));
}
