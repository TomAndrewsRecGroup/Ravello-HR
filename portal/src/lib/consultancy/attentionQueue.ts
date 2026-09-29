// Core-OS 360 Phase 6, section 3: the Attention Queue. A cross-client
// operational VIEW — it never duplicates the underlying action or
// record, only lists it with a direct link back to it. Every threshold
// here matches lib/health/portfolioCounts.ts (admin) exactly, so the
// Client Health Snapshot's counts and this queue's rows can never
// disagree about what counts as "critical".

export type QueueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AttentionQueueItem {
  key: string;
  clientOrganisationId: string;
  clientName: string;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  issueType: string;
  severity: QueueSeverity;
  owner: string | null;
  dueDate: string | null;
  ageDays: number | null;
  state: string;
  link: string;
}

const DAY_MS = 86_400_000;
const ageDays = (dateStr: string | null, today: Date): number | null =>
  dateStr ? Math.max(0, Math.floor((today.getTime() - new Date(dateStr).getTime()) / DAY_MS)) : null;

export interface AttentionQueueInput {
  orgNames: Map<string, string>;
  today: Date;
  actions: { id: string; company_id: string; status: string; severity: string | null; title: string; due_date: string | null; assigned_to: string | null }[];
  legalObligations: { id: string; company_id: string; applicability_status: string; next_review_due: string | null; legal_requirement_id: string }[];
  documentsReviewDue: { id: string; company_id: string; title: string; review_due_at: string | null }[];
  incidents: { id: string; company_id: string; status: string; severity: string | null; incident_type: string | null; incident_number: string | null }[];
  deploymentStatus: { person_id: string; company_id: string; status: string; full_name?: string | null; result: { summary?: { safety_critical_gap?: boolean } } | null }[];
  equipment: { id: string; company_id: string; status: string; name: string }[];
  auditFindings: { id: string; company_id: string; severity: string; closed_at: string | null; created_at: string; hs_audit_response_id: string | null }[];
  contractors: { id: string; company_id: string; approval_status: string; name: string }[];
  contractorInsurances: { id: string; contractor_id: string; expires_on: string | null; insurance_type: string }[];
  environmentalPermits: { id: string; company_id: string; status: string; expires_on: string | null; permit_type: string }[];
  managementReviews: { id: string; company_id: string; status: string; review_date: string | null }[];
  serviceRequests: { id: string; company_id: string; status: string; subject: string; priority: string | null; created_at: string }[];
}

const srSeverity = (priority: string | null): QueueSeverity =>
  priority === 'urgent' ? 'critical' : priority === 'high' ? 'high' : 'medium';

const incidentSeverity = (sev: string | null): QueueSeverity =>
  sev === 'fatal' || sev === 'critical' ? 'critical' : sev === 'major' ? 'high' : 'medium';

const findingSeverity = (sev: string): QueueSeverity => (sev === 'critical' ? 'critical' : 'high');

export function buildAttentionQueue(input: AttentionQueueInput): AttentionQueueItem[] {
  const { orgNames, today } = input;
  const name = (id: string) => orgNames.get(id) ?? 'Unknown client';
  const items: AttentionQueueItem[] = [];

  for (const a of input.actions) {
    if (!['active', 'in_progress', 'awaiting_verification'].includes(a.status)) continue;
    if (!a.severity || !['high', 'critical'].includes(a.severity)) continue;
    items.push({
      key: `action:${a.id}`, clientOrganisationId: a.company_id, clientName: name(a.company_id),
      sourceModule: 'Actions', sourceType: 'actions', sourceId: a.id,
      issueType: 'Open critical/high action', severity: a.severity as QueueSeverity,
      owner: a.assigned_to, dueDate: a.due_date, ageDays: ageDays(a.due_date, today),
      state: a.title, link: '/dashboard',
    });
  }

  for (const o of input.legalObligations) {
    if (o.applicability_status !== 'applicable' || !o.next_review_due || o.next_review_due >= today.toISOString().slice(0, 10)) continue;
    items.push({
      key: `legal:${o.id}`, clientOrganisationId: o.company_id, clientName: name(o.company_id),
      sourceModule: 'Legal Register', sourceType: 'organisation_legal_obligations', sourceId: o.id,
      issueType: 'Overdue legal evaluation', severity: 'high',
      owner: null, dueDate: o.next_review_due, ageDays: ageDays(o.next_review_due, today),
      state: 'Review overdue', link: '/protect/legal-register',
    });
  }

  for (const d of input.documentsReviewDue) {
    items.push({
      key: `document:${d.id}`, clientOrganisationId: d.company_id, clientName: name(d.company_id),
      sourceModule: 'Documents', sourceType: 'hs_documents', sourceId: d.id,
      issueType: 'Controlled document overdue for review', severity: 'medium',
      owner: null, dueDate: d.review_due_at, ageDays: ageDays(d.review_due_at, today),
      state: d.title, link: '/protect/documents',
    });
  }

  for (const i of input.incidents) {
    if (!['under_investigation', 'awaiting_actions', 'awaiting_verification'].includes(i.status)) continue;
    if (!i.severity || !['serious', 'major', 'critical', 'fatal'].includes(i.severity)) continue;
    items.push({
      key: `incident:${i.id}`, clientOrganisationId: i.company_id, clientName: name(i.company_id),
      sourceModule: 'Incidents', sourceType: 'hs_incidents', sourceId: i.id,
      issueType: 'Open serious incident investigation', severity: incidentSeverity(i.severity),
      owner: null, dueDate: null, ageDays: null,
      state: i.incident_number ?? i.incident_type ?? 'Incident under investigation', link: '/protect/incidents',
    });
  }

  for (const p of input.deploymentStatus) {
    if (p.status === 'READY' && p.result?.summary?.safety_critical_gap !== true) continue;
    const gap = p.result?.summary?.safety_critical_gap === true;
    items.push({
      key: `workforce:${p.person_id}`, clientOrganisationId: p.company_id, clientName: name(p.company_id),
      sourceModule: 'Workforce', sourceType: 'person_deployment_status', sourceId: p.person_id,
      issueType: gap ? 'Safety-critical training/competency gap' : 'Worker not Safe to Deploy',
      severity: gap ? 'high' : 'medium',
      owner: null, dueDate: null, ageDays: null,
      state: p.full_name ?? 'A worker', link: '/lead/workforce',
    });
  }

  for (const e of input.equipment) {
    if (!['quarantined', 'out_of_service'].includes(e.status)) continue;
    items.push({
      key: `asset:${e.id}`, clientOrganisationId: e.company_id, clientName: name(e.company_id),
      sourceModule: 'Assets', sourceType: 'hs_equipment', sourceId: e.id,
      issueType: e.status === 'quarantined' ? 'Asset quarantined (critical defect)' : 'Asset unavailable',
      severity: e.status === 'quarantined' ? 'high' : 'medium',
      owner: null, dueDate: null, ageDays: null,
      state: e.name, link: '/protect/equipment',
    });
  }

  for (const f of input.auditFindings) {
    if (f.closed_at !== null || !['major', 'critical'].includes(f.severity)) continue;
    items.push({
      key: `finding:${f.id}`, clientOrganisationId: f.company_id, clientName: name(f.company_id),
      sourceModule: 'Audits', sourceType: 'audit_findings', sourceId: f.id,
      issueType: 'Major audit finding open', severity: findingSeverity(f.severity),
      owner: null, dueDate: null, ageDays: ageDays(f.created_at, today),
      state: `${f.severity} finding`, link: '/protect/audits',
    });
  }

  const insByContractor = new Map<string, { expires_on: string | null; insurance_type: string }[]>();
  for (const ins of input.contractorInsurances) {
    if (!insByContractor.has(ins.contractor_id)) insByContractor.set(ins.contractor_id, []);
    insByContractor.get(ins.contractor_id)!.push(ins);
  }
  const plus30 = new Date(today.getTime() + 30 * DAY_MS).toISOString().slice(0, 10);
  for (const c of input.contractors) {
    const expiring = (insByContractor.get(c.id) ?? []).filter(i => i.expires_on && i.expires_on <= plus30);
    if (c.approval_status === 'approved' && expiring.length === 0) continue;
    items.push({
      key: `contractor:${c.id}`, clientOrganisationId: c.company_id, clientName: name(c.company_id),
      sourceModule: 'Contractors', sourceType: 'contractors', sourceId: c.id,
      issueType: c.approval_status !== 'approved' ? 'Contractor not approved' : 'Contractor insurance expiring',
      severity: 'medium',
      owner: null, dueDate: expiring[0]?.expires_on ?? null, ageDays: null,
      state: c.name, link: '/protect', // contractors have no dedicated portal page today
    });
  }

  for (const p of input.environmentalPermits) {
    if (p.status !== 'active' || !p.expires_on || p.expires_on > plus30) continue;
    items.push({
      key: `env-permit:${p.id}`, clientOrganisationId: p.company_id, clientName: name(p.company_id),
      sourceModule: 'Environmental', sourceType: 'environmental_permits', sourceId: p.id,
      issueType: 'Environmental permit expiring', severity: 'medium',
      owner: null, dueDate: p.expires_on, ageDays: null,
      state: p.permit_type, link: '/protect/environmental-permits',
    });
  }

  for (const r of input.managementReviews) {
    if (r.status !== 'scheduled' || !r.review_date || r.review_date > plus30) continue;
    items.push({
      key: `mgmt-review:${r.id}`, clientOrganisationId: r.company_id, clientName: name(r.company_id),
      sourceModule: 'Governance', sourceType: 'management_reviews', sourceId: r.id,
      issueType: 'Management review due', severity: 'low',
      owner: null, dueDate: r.review_date, ageDays: null,
      state: 'Management review scheduled', link: '/protect/management-review',
    });
  }

  for (const s of input.serviceRequests) {
    if (!['new', 'in_progress'].includes(s.status)) continue;
    items.push({
      key: `service-request:${s.id}`, clientOrganisationId: s.company_id, clientName: name(s.company_id),
      sourceModule: 'Support', sourceType: 'service_requests', sourceId: s.id,
      issueType: 'Outstanding service request', severity: srSeverity(s.priority),
      owner: null, dueDate: null, ageDays: ageDays(s.created_at, today),
      state: s.subject, link: '/support',
    });
  }

  const rank: Record<QueueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.ageDays ?? 0) - (a.ageDays ?? 0));
}
