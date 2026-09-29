// Core-OS 360 Phase 6, section 7: the Cross-Client Calendar. A
// READ-TIME AGGREGATE, the same discipline admin's own
// lib/governance/calendar.ts already established — the source rows
// remain the single source of truth; this only unions their own dates
// into one sorted list, each tagged with its own client (section 7:
// "client context must be visually unambiguous") and a link that
// always routes through /open-workspace so it can never open under the
// wrong active organisation.

export type PortfolioCalendarEventType =
  | 'visit' | 'audit' | 'legal_review' | 'management_review'
  | 'training_expiry' | 'document_review' | 'roadmap_milestone' | 'material_expiry';

export interface PortfolioCalendarEvent {
  type: PortfolioCalendarEventType;
  date: string; // ISO date (yyyy-mm-dd)
  clientOrganisationId: string;
  clientName: string;
  title: string;
  link: string;
}

const toDateOnly = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : null;
};

export interface PortfolioCalendarInput {
  orgNames: Map<string, string>;
  visits: { id: string; client_organisation_id: string; scheduled_date: string; visit_type: string; status: string }[];
  auditProgrammes: { id: string; company_id: string; name: string; next_due_date: string | null; active: boolean }[];
  legalObligations: { id: string; company_id: string; next_review_due: string | null; applicability_status: string }[];
  managementReviews: { id: string; company_id: string; review_date: string | null; status: string }[];
  trainingExpiring: { id: string; company_id: string; course_name: string; expires_on: string | null }[];
  documentsReview: { id: string; company_id: string; title: string; review_due_at: string | null; status: string }[];
  milestones: { id: string; company_id: string; title: string; due_date: string | null }[];
  environmentalPermits: { id: string; company_id: string; permit_type: string; expires_on: string | null; status: string }[];
  contractorInsurances: { id: string; company_id: string; insurance_type: string; expires_on: string | null }[];
  isoCertifications: { id: string; company_id: string; certificate_number: string | null; expires_on: string | null }[];
}

export function buildPortfolioCalendar(input: PortfolioCalendarInput): PortfolioCalendarEvent[] {
  const name = (id: string) => input.orgNames.get(id) ?? 'Unknown client';
  const events: PortfolioCalendarEvent[] = [];

  for (const v of input.visits) {
    // Phase 7 (173) widened consultancy_visits.status to the full
    // visit lifecycle — an "upcoming" calendar entry is one not yet
    // under way: planned or confirmed.
    if (v.status !== 'planned' && v.status !== 'confirmed') continue;
    const d = toDateOnly(v.scheduled_date); if (!d) continue;
    events.push({ type: 'visit', date: d, clientOrganisationId: v.client_organisation_id, clientName: name(v.client_organisation_id), title: `Consultant visit (${v.visit_type})`, link: '/dashboard' });
  }
  for (const a of input.auditProgrammes) {
    if (!a.active) continue;
    const d = toDateOnly(a.next_due_date); if (!d) continue;
    events.push({ type: 'audit', date: d, clientOrganisationId: a.company_id, clientName: name(a.company_id), title: `Audit due: ${a.name}`, link: '/protect/audits' });
  }
  for (const o of input.legalObligations) {
    if (o.applicability_status !== 'applicable') continue;
    const d = toDateOnly(o.next_review_due); if (!d) continue;
    events.push({ type: 'legal_review', date: d, clientOrganisationId: o.company_id, clientName: name(o.company_id), title: 'Legal review due', link: '/protect/legal-register' });
  }
  for (const r of input.managementReviews) {
    if (r.status !== 'scheduled') continue;
    const d = toDateOnly(r.review_date); if (!d) continue;
    events.push({ type: 'management_review', date: d, clientOrganisationId: r.company_id, clientName: name(r.company_id), title: 'Management review scheduled', link: '/protect/management-review' });
  }
  for (const t of input.trainingExpiring) {
    const d = toDateOnly(t.expires_on); if (!d) continue;
    events.push({ type: 'training_expiry', date: d, clientOrganisationId: t.company_id, clientName: name(t.company_id), title: `Training expiring: ${t.course_name}`, link: '/lead/training-records' });
  }
  for (const doc of input.documentsReview) {
    if (doc.status !== 'active') continue;
    const d = toDateOnly(doc.review_due_at); if (!d) continue;
    events.push({ type: 'document_review', date: d, clientOrganisationId: doc.company_id, clientName: name(doc.company_id), title: `Document review due: ${doc.title}`, link: '/protect/documents' });
  }
  for (const m of input.milestones) {
    const d = toDateOnly(m.due_date); if (!d) continue;
    events.push({ type: 'roadmap_milestone', date: d, clientOrganisationId: m.company_id, clientName: name(m.company_id), title: `Milestone: ${m.title}`, link: '/lead/roadmap' });
  }
  for (const p of input.environmentalPermits) {
    if (p.status !== 'active') continue;
    const d = toDateOnly(p.expires_on); if (!d) continue;
    events.push({ type: 'material_expiry', date: d, clientOrganisationId: p.company_id, clientName: name(p.company_id), title: `Environmental permit expires: ${p.permit_type}`, link: '/protect/environmental-permits' });
  }
  for (const i of input.contractorInsurances) {
    const d = toDateOnly(i.expires_on); if (!d) continue;
    events.push({ type: 'material_expiry', date: d, clientOrganisationId: i.company_id, clientName: name(i.company_id), title: `Contractor insurance expires: ${i.insurance_type}`, link: '/protect' });
  }
  for (const c of input.isoCertifications) {
    const d = toDateOnly(c.expires_on); if (!d) continue;
    events.push({ type: 'material_expiry', date: d, clientOrganisationId: c.company_id, clientName: name(c.company_id), title: `ISO certification expires${c.certificate_number ? `: ${c.certificate_number}` : ''}`, link: '/protect/iso-readiness' });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}
