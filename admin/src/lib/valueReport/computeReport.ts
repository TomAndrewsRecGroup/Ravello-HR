import { computeLeadMetrics, type AbsenceRecordRow, type OnboardingInstanceRow, type PerformanceReviewRow, type TrainingNeedRow } from './leadMetrics';
import {
  computeGovernanceMetrics,
  type GovernanceAuditFindingRow, type GovernanceClauseRow, type GovernanceComplianceEvaluationRow,
  type GovernanceEvidenceLinkRow, type GovernanceLegalObligationRow, type GovernanceObjectiveRow, type GovernanceStandardRow,
} from '../governance/governanceReportMetrics';

// The full Client Value Report computation, extracted from
// ValueReportClient's useMemo so the monthly auto-generation cron
// (server-side, no React) computes EXACTLY what a staff member
// downloading the same company/month from the page would get — one
// calculation, not two that could drift.

export function inMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

export interface ValueReportInputs {
  requisitions: any[];
  candidates: any[];
  documents: any[];
  complianceItems: any[];
  serviceRequests: any[];
  actions: any[];
  profiles: any[];
  // Real retainer source, replacing the dead `client_services` table
  // (2026-10-01, retired — see CLAUDE.md): a plain lookup by company
  // id for monthly_retainer_pence, never a second billing source.
  companies: any[];
  trainingNeeds: TrainingNeedRow[];
  performanceReviews: PerformanceReviewRow[];
  absenceRecords: AbsenceRecordRow[];
  onboardingInstances: OnboardingInstanceRow[];
  // Core-OS 360 Phase 5, Group 8: GOVERNANCE section inputs.
  standards: GovernanceStandardRow[];
  standardClauses: GovernanceClauseRow[];
  standardEvidenceLinks: GovernanceEvidenceLinkRow[];
  legalObligations: GovernanceLegalObligationRow[];
  complianceEvaluations: GovernanceComplianceEvaluationRow[];
  objectives: GovernanceObjectiveRow[];
  auditFindings: GovernanceAuditFindingRow[];
}

export interface ValueReportData {
  hire: { newRoles: number; filled: number; candidates: number; activeRoles: number; totalFilled: number };
  // `tickets`/`ticket_messages` were retired as the support object back
  // in "Support & BD in sync" (service_requests replaced them) — this
  // used to carry a parallel ticketsRaised/ticketsResolved/
  // avgResolutionHours trio sourced from that now-permanently-empty
  // table, so every Value Report ever generated silently reported zero
  // tickets. avgResponseHours replaces avgResolutionHours, computed
  // from service_requests' own first-response time instead.
  support: { serviceRequests: number; serviceRequestsResponded: number; avgResponseHours: number };
  protect: { complianceItems: number; documentsUploaded: number; actionsCreated: number; actionsCompleted: number };
  lead: ReturnType<typeof computeLeadMetrics>;
  governance: ReturnType<typeof computeGovernanceMetrics>;
  usage: { portalUsers: number; mrr: number };
}

export function computeValueReport(companyId: string, year: number, month: number, d: ValueReportInputs): ValueReportData {
  const cid = companyId;

  const monthReqs = d.requisitions.filter((r: any) => r.company_id === cid && inMonth(r.created_at, year, month));
  const filledReqs = d.requisitions.filter((r: any) => r.company_id === cid && r.stage === 'filled' && inMonth(r.updated_at, year, month));
  const monthCandidates = d.candidates.filter((c: any) => c.company_id === cid && inMonth(c.created_at, year, month));
  const monthDocs = d.documents.filter((doc: any) => doc.company_id === cid && inMonth(doc.created_at, year, month));
  const monthCompliance = d.complianceItems.filter((c: any) => c.company_id === cid && inMonth(c.created_at, year, month));
  const monthServReqs = d.serviceRequests.filter((s: any) => s.company_id === cid && inMonth(s.created_at, year, month));
  const respondedServReqs = d.serviceRequests.filter((s: any) => s.company_id === cid && inMonth(s.responded_at, year, month));
  const monthActions = d.actions.filter((a: any) => a.company_id === cid && inMonth(a.created_at, year, month));
  const completedActions = d.actions.filter((a: any) => a.company_id === cid && inMonth(a.completed_at, year, month));

  const totalActiveRoles = d.requisitions.filter((r: any) => r.company_id === cid && !['filled', 'cancelled'].includes(r.stage)).length;
  const totalFilled = d.requisitions.filter((r: any) => r.company_id === cid && r.stage === 'filled').length;
  const totalUsers = d.profiles.filter((p: any) => p.company_id === cid).length;
  const company = d.companies.find((c: any) => c.id === cid);
  const mrr = (company?.monthly_retainer_pence ?? 0) / 100;

  let avgResponse = 0;
  if (respondedServReqs.length > 0) {
    const totalHours = respondedServReqs.reduce((sum: number, s: any) => sum + (new Date(s.responded_at).getTime() - new Date(s.created_at).getTime()) / 3600000, 0);
    avgResponse = Math.round(totalHours / respondedServReqs.length);
  }

  const lead = computeLeadMetrics(cid, year, month, d.trainingNeeds, d.performanceReviews, d.absenceRecords, d.onboardingInstances);
  const governance = computeGovernanceMetrics(
    cid, year, month, d.standards, d.standardClauses, d.standardEvidenceLinks,
    d.legalObligations, d.complianceEvaluations, d.objectives, d.auditFindings,
  );

  return {
    hire: { newRoles: monthReqs.length, filled: filledReqs.length, candidates: monthCandidates.length, activeRoles: totalActiveRoles, totalFilled },
    support: { serviceRequests: monthServReqs.length, serviceRequestsResponded: respondedServReqs.length, avgResponseHours: avgResponse },
    protect: { complianceItems: monthCompliance.length, documentsUploaded: monthDocs.length, actionsCreated: monthActions.length, actionsCompleted: completedActions.length },
    lead,
    governance,
    usage: { portalUsers: totalUsers, mrr },
  };
}

// Core-OS 360 Phase 6, section 10: "monthly/quarterly consultancy
// reporting". Rather than widen computeValueReport()'s own month-only
// filtering (real regression risk to the already-live monthly report
// this file's own header comment says must never drift from the
// downloaded one), a quarter is composed from the SAME, UNCHANGED
// per-month computation run three times and merged field-by-field —
// FLOW fields (something that happened in the period: new roles,
// tickets raised, actions completed, …) are SUMMED across the three
// months; STOCK fields (a snapshot of current state — active roles,
// portal users, MRR, ISO readiness, objectives on track, open audit
// findings, open training/onboarding, …) are taken from the quarter's
// LAST month only, because summing three snapshots of the same fact
// would triple-count it. `reviewsOverdue` is the one field that is
// genuinely NEITHER: it is "as of THIS report month" (leadMetrics.ts's
// own comment), so a naive sum across three months would count the
// same still-overdue review three times over — it is treated as a
// stock field here too, read from the quarter's last month, meaning
// "overdue as of the quarter's close".
export function quarterMonths(year: number, quarter: 1 | 2 | 3 | 4): [number, number, number] {
  const first = (quarter - 1) * 3;
  return [first, first + 1, first + 2];
}

export function computeQuarterlyValueReport(companyId: string, year: number, quarter: 1 | 2 | 3 | 4, d: ValueReportInputs): ValueReportData {
  const months = quarterMonths(year, quarter).map(m => computeValueReport(companyId, year, m, d));
  const [m1, m2, m3] = months;
  const sum = (k: (r: ValueReportData) => number) => months.reduce((s, r) => s + k(r), 0);

  return {
    hire: {
      newRoles: sum(r => r.hire.newRoles), filled: sum(r => r.hire.filled), candidates: sum(r => r.hire.candidates),
      activeRoles: m3.hire.activeRoles, totalFilled: m3.hire.totalFilled,
    },
    support: {
      serviceRequests: sum(r => r.support.serviceRequests), serviceRequestsResponded: sum(r => r.support.serviceRequestsResponded),
      // A simple average of the three months' own averages — not
      // recomputed from raw service requests, which this composed
      // function never sees; each month's avgResponseHours is already
      // 0 when that month answered nothing, so this never divides by a
      // count of months with no data.
      avgResponseHours: Math.round((m1.support.avgResponseHours + m2.support.avgResponseHours + m3.support.avgResponseHours) / 3),
    },
    protect: {
      complianceItems: sum(r => r.protect.complianceItems), documentsUploaded: sum(r => r.protect.documentsUploaded),
      actionsCreated: sum(r => r.protect.actionsCreated), actionsCompleted: sum(r => r.protect.actionsCompleted),
    },
    lead: {
      trainingNeedsFlagged: sum(r => r.lead.trainingNeedsFlagged), trainingNeedsResolved: sum(r => r.lead.trainingNeedsResolved),
      trainingNeedsOpen: m3.lead.trainingNeedsOpen,
      reviewsDue: sum(r => r.lead.reviewsDue), reviewsCompleted: sum(r => r.lead.reviewsCompleted),
      reviewsOverdue: m3.lead.reviewsOverdue,
      absenceDays: sum(r => r.lead.absenceDays),
      onboardingStarted: sum(r => r.lead.onboardingStarted), onboardingCompleted: sum(r => r.lead.onboardingCompleted),
      onboardingActive: m3.lead.onboardingActive,
    },
    governance: {
      isoReadiness: m3.governance.isoReadiness,
      legalObligationsApplicable: m3.governance.legalObligationsApplicable,
      legalEvaluationsThisMonth: sum(r => r.governance.legalEvaluationsThisMonth),
      legalEvaluationsNonComplianceThisMonth: sum(r => r.governance.legalEvaluationsNonComplianceThisMonth),
      objectivesTotal: m3.governance.objectivesTotal, objectivesOnTrack: m3.governance.objectivesOnTrack,
      auditFindingsOpenedThisMonth: sum(r => r.governance.auditFindingsOpenedThisMonth),
      auditFindingsClosedThisMonth: sum(r => r.governance.auditFindingsClosedThisMonth),
      auditFindingsOpen: m3.governance.auditFindingsOpen,
    },
    usage: m3.usage,
  };
}
