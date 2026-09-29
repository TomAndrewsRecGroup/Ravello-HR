// Core-OS 360 Phase 6, section 2 (Client Health Snapshot): the factual
// portfolio counts from the spec's own worked example — open critical
// actions, overdue legal reviews, workers not ready, assets
// unavailable, major audit findings, controlled documents overdue,
// next consultant visit. Every threshold here is exact and documented;
// there is no AI health score anywhere in this file.
//
// Pure function, no Supabase client — the cron route fetches every
// source table in bulk (never per-company, never per-client N+1: the
// same shape the pre-existing health-snapshot cron already uses, and
// the one that scales to the 500+ clients Phase 6's own test brief
// calls out) and this file only counts.

export interface PortfolioCountRow { company_id: string }
export interface ActionRow { company_id: string; status: string; severity: string | null }
export interface LegalObligationRow { company_id: string; applicability_status: string; next_review_due: string | null }
export interface IncidentRow { company_id: string; status: string; severity: string | null }
export interface DeploymentStatusRow { company_id: string; status: string; result: { summary?: { safety_critical_gap?: boolean } } | null }
export interface EquipmentRow { company_id: string; status: string }
export interface AuditFindingRow { company_id: string; severity: string; closed_at: string | null }
export interface ContractorRow { id: string; company_id: string; approval_status: string }
export interface ContractorInsuranceRow { contractor_id: string; expires_on: string | null }
export interface EnvironmentalPermitRow { company_id: string; status: string; expires_on: string | null }
export interface ManagementReviewRow { company_id: string; status: string; review_date: string | null }
export interface ServiceRequestRow { company_id: string; status: string }
export interface ConsultancyVisitRow { client_organisation_id: string; status: string; scheduled_date: string }

export interface PortfolioCounts {
  open_critical_actions: number;
  overdue_legal_evaluations: number;
  overdue_controlled_documents: number;
  open_incident_investigations: number;
  safety_critical_gaps: number;
  workers_not_ready: number;
  assets_unavailable: number;
  major_audit_findings: number;
  contractor_expiring: number;
  environmental_permits_expiring: number;
  management_reviews_due: number;
  outstanding_service_requests: number;
  next_consultant_visit_date: string | null;
}

const OPEN_ACTION_STATUSES = new Set(['active', 'in_progress', 'awaiting_verification']);
const CRITICAL_ACTION_SEVERITIES = new Set(['high', 'critical']);
const OPEN_INCIDENT_STATUSES = new Set(['under_investigation', 'awaiting_actions', 'awaiting_verification']);
const SERIOUS_INCIDENT_SEVERITIES = new Set(['serious', 'major', 'critical', 'fatal']);
const UNAVAILABLE_ASSET_STATUSES = new Set(['quarantined', 'out_of_service']);
const MAJOR_FINDING_SEVERITIES = new Set(['major', 'critical']);
const OUTSTANDING_REQUEST_STATUSES = new Set(['new', 'in_progress']);

const DAY_MS = 86_400_000;

function countBy<T extends { company_id: string }>(rows: T[], pred: (r: T) => boolean): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!pred(r)) continue;
    m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1);
  }
  return m;
}

export function computePortfolioCounts(
  companyIds: string[],
  today: Date,
  input: {
    actions: ActionRow[];
    legalObligations: LegalObligationRow[];
    documentsReviewDue: PortfolioCountRow[]; // pre-filtered to status='review_due'
    incidents: IncidentRow[];
    deploymentStatus: DeploymentStatusRow[];
    equipment: EquipmentRow[];
    auditFindings: AuditFindingRow[];
    contractors: ContractorRow[];
    contractorInsurances: ContractorInsuranceRow[];
    environmentalPermits: EnvironmentalPermitRow[];
    managementReviews: ManagementReviewRow[];
    serviceRequests: ServiceRequestRow[];
    consultancyVisits: ConsultancyVisitRow[];
  },
): Map<string, PortfolioCounts> {
  const todayStr = today.toISOString().slice(0, 10);
  const plus30 = new Date(today.getTime() + 30 * DAY_MS).toISOString().slice(0, 10);

  const criticalActions = countBy(input.actions, a => OPEN_ACTION_STATUSES.has(a.status) && !!a.severity && CRITICAL_ACTION_SEVERITIES.has(a.severity));
  const overdueLegal = countBy(input.legalObligations, o => o.applicability_status === 'applicable' && !!o.next_review_due && o.next_review_due < todayStr);
  const overdueDocs = countBy(input.documentsReviewDue, () => true);
  const openIncidents = countBy(input.incidents, i => OPEN_INCIDENT_STATUSES.has(i.status) && !!i.severity && SERIOUS_INCIDENT_SEVERITIES.has(i.severity));
  const assetsUnavailable = countBy(input.equipment, e => UNAVAILABLE_ASSET_STATUSES.has(e.status));
  const majorFindings = countBy(input.auditFindings, f => MAJOR_FINDING_SEVERITIES.has(f.severity) && f.closed_at === null);
  const permitsExpiring = countBy(input.environmentalPermits, p => p.status === 'active' && !!p.expires_on && p.expires_on <= plus30);
  const reviewsDue = countBy(input.managementReviews, r => r.status === 'scheduled' && !!r.review_date && r.review_date <= plus30);
  const serviceRequests = countBy(input.serviceRequests, r => OUTSTANDING_REQUEST_STATUSES.has(r.status));

  // Deployment status has no per-row severity filter — every non-READY
  // person counts, and safety_critical_gap is read from the engine's
  // own stored summary (Phase 3's ONE definition of safety-critical),
  // never re-derived here.
  const notReady = countBy(input.deploymentStatus, d => d.status !== 'READY');
  const safetyGaps = countBy(input.deploymentStatus, d => d.result?.summary?.safety_critical_gap === true);

  // Contractors: an expiring/missing insurance policy OR a non-approved
  // status both count, but a contractor with BOTH counts once — this is
  // "how many contractors need attention", not "how many problems".
  const flaggedContractorIds = new Set<string>();
  const contractorById = new Map(input.contractors.map(c => [c.id, c] as const));
  for (const c of input.contractors) if (c.approval_status !== 'approved') flaggedContractorIds.add(c.id);
  for (const ins of input.contractorInsurances) {
    if (ins.expires_on && ins.expires_on <= plus30) flaggedContractorIds.add(ins.contractor_id);
  }
  const contractorExpiring = new Map<string, number>();
  for (const id of flaggedContractorIds) {
    const c = contractorById.get(id);
    if (!c) continue; // an insurance row for a contractor outside this batch — never counted against the wrong company
    contractorExpiring.set(c.company_id, (contractorExpiring.get(c.company_id) ?? 0) + 1);
  }

  const nextVisit = new Map<string, string>();
  for (const v of input.consultancyVisits) {
    if (v.status !== 'scheduled' || v.scheduled_date < todayStr) continue;
    const current = nextVisit.get(v.client_organisation_id);
    if (!current || v.scheduled_date < current) nextVisit.set(v.client_organisation_id, v.scheduled_date);
  }

  const out = new Map<string, PortfolioCounts>();
  for (const id of companyIds) {
    out.set(id, {
      open_critical_actions: criticalActions.get(id) ?? 0,
      overdue_legal_evaluations: overdueLegal.get(id) ?? 0,
      overdue_controlled_documents: overdueDocs.get(id) ?? 0,
      open_incident_investigations: openIncidents.get(id) ?? 0,
      safety_critical_gaps: safetyGaps.get(id) ?? 0,
      workers_not_ready: notReady.get(id) ?? 0,
      assets_unavailable: assetsUnavailable.get(id) ?? 0,
      major_audit_findings: majorFindings.get(id) ?? 0,
      contractor_expiring: contractorExpiring.get(id) ?? 0,
      environmental_permits_expiring: permitsExpiring.get(id) ?? 0,
      management_reviews_due: reviewsDue.get(id) ?? 0,
      outstanding_service_requests: serviceRequests.get(id) ?? 0,
      next_consultant_visit_date: nextVisit.get(id) ?? null,
    });
  }
  return out;
}
