// GOVERNANCE section of the Client Value Report — Core-OS 360 Phase 5,
// Group 8. Mirrors leadMetrics.ts exactly: extracted so the same
// computation runs from ValueReportClient's browser download AND the
// monthly auto-generation cron (computeValueReport, computeReport.ts),
// one calculation, never two that could drift.
//
// ISO readiness is COUNTS ONLY (clauses total / with evidence), the
// same posture the standalone readiness dashboard already takes
// (158) — never a percentage presented as a score, never a
// certification claim. Legal evaluation counts use the cautious
// vocabulary compliance_evaluations.status already enforces; this
// module invents no new judgement on top of it.

export interface GovernanceStandardRow { id: string; code: string }
export interface GovernanceClauseRow { id: string; standard_id: string }
export interface GovernanceEvidenceLinkRow { company_id: string; clause_id: string }
export interface GovernanceLegalObligationRow { id: string; company_id: string; applicability_status: string }
export interface GovernanceComplianceEvaluationRow { company_id: string; status: string; evaluated_at: string }
export interface GovernanceObjectiveRow { company_id: string; status: string }
export interface GovernanceAuditFindingRow { company_id: string; created_at: string; closed_at: string | null }

export interface GovernanceIsoReadinessRow {
  standardCode: string;
  clausesTotal: number;
  clausesWithEvidence: number;
}

export interface GovernanceMetrics {
  isoReadiness: GovernanceIsoReadinessRow[];
  legalObligationsApplicable: number;
  legalEvaluationsThisMonth: number;
  legalEvaluationsNonComplianceThisMonth: number;
  objectivesTotal: number;
  objectivesOnTrack: number;
  auditFindingsOpenedThisMonth: number;
  auditFindingsClosedThisMonth: number;
  auditFindingsOpen: number;
}

const ON_TRACK_STATUSES = new Set(['on_track', 'achieved']);
const EXCLUDED_OBJECTIVE_STATUSES = new Set(['draft', 'abandoned']);
const NONCOMPLIANCE_STATUSES = new Set(['potential_noncompliance', 'confirmed_noncompliance']);

function inMonth(dateStr: string | null, year: number, month: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

export function computeGovernanceMetrics(
  companyId: string, year: number, month: number,
  standards: GovernanceStandardRow[], clauses: GovernanceClauseRow[], evidenceLinks: GovernanceEvidenceLinkRow[],
  legalObligations: GovernanceLegalObligationRow[], complianceEvaluations: GovernanceComplianceEvaluationRow[],
  objectives: GovernanceObjectiveRow[], auditFindings: GovernanceAuditFindingRow[],
): GovernanceMetrics {
  const companyLinkedClauseIds = new Set(
    evidenceLinks.filter(l => l.company_id === companyId).map(l => l.clause_id),
  );
  const isoReadiness: GovernanceIsoReadinessRow[] = standards.map(s => {
    const standardClauses = clauses.filter(c => c.standard_id === s.id);
    return {
      standardCode: s.code,
      clausesTotal: standardClauses.length,
      clausesWithEvidence: standardClauses.filter(c => companyLinkedClauseIds.has(c.id)).length,
    };
  });

  const companyObligations = legalObligations.filter(o => o.company_id === companyId);
  const legalObligationsApplicable = companyObligations.filter(o => o.applicability_status === 'applicable').length;

  const monthEvaluations = complianceEvaluations.filter(e => e.company_id === companyId && inMonth(e.evaluated_at, year, month));
  const legalEvaluationsThisMonth = monthEvaluations.length;
  const legalEvaluationsNonComplianceThisMonth = monthEvaluations.filter(e => NONCOMPLIANCE_STATUSES.has(e.status)).length;

  const companyObjectives = objectives.filter(o => o.company_id === companyId && !EXCLUDED_OBJECTIVE_STATUSES.has(o.status));
  const objectivesTotal = companyObjectives.length;
  const objectivesOnTrack = companyObjectives.filter(o => ON_TRACK_STATUSES.has(o.status)).length;

  const companyFindings = auditFindings.filter(f => f.company_id === companyId);
  const auditFindingsOpenedThisMonth = companyFindings.filter(f => inMonth(f.created_at, year, month)).length;
  const auditFindingsClosedThisMonth = companyFindings.filter(f => inMonth(f.closed_at, year, month)).length;
  const auditFindingsOpen = companyFindings.filter(f => f.closed_at == null).length;

  return {
    isoReadiness,
    legalObligationsApplicable,
    legalEvaluationsThisMonth,
    legalEvaluationsNonComplianceThisMonth,
    objectivesTotal,
    objectivesOnTrack,
    auditFindingsOpenedThisMonth,
    auditFindingsClosedThisMonth,
    auditFindingsOpen,
  };
}
