import { describe, expect, it } from 'vitest';
import { computeGovernanceMetrics } from './governanceReportMetrics';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';

const standards = [{ id: 'std-45001', code: 'iso_45001_2018' }, { id: 'std-14001', code: 'iso_14001_2015' }];
const clauses = [
  { id: 'clause-1', standard_id: 'std-45001' }, { id: 'clause-2', standard_id: 'std-45001' },
  { id: 'clause-3', standard_id: 'std-14001' },
];

describe('computeGovernanceMetrics', () => {
  it('computes ISO readiness as counts only, scoped to the report company', () => {
    const links = [
      { company_id: COMPANY_A, clause_id: 'clause-1' },
      { company_id: COMPANY_B, clause_id: 'clause-2' }, // a different company's link must never count for A
    ];
    const m = computeGovernanceMetrics(COMPANY_A, 2026, 8, standards, clauses, links, [], [], [], []);
    expect(m.isoReadiness).toEqual([
      { standardCode: 'iso_45001_2018', clausesTotal: 2, clausesWithEvidence: 1 },
      { standardCode: 'iso_14001_2015', clausesTotal: 1, clausesWithEvidence: 0 },
    ]);
  });

  it('counts only applicable obligations for this company', () => {
    const obligations = [
      { id: 'o1', company_id: COMPANY_A, applicability_status: 'applicable' },
      { id: 'o2', company_id: COMPANY_A, applicability_status: 'under_review' },
      { id: 'o3', company_id: COMPANY_B, applicability_status: 'applicable' },
    ];
    const m = computeGovernanceMetrics(COMPANY_A, 2026, 8, [], [], [], obligations, [], [], []);
    expect(m.legalObligationsApplicable).toBe(1);
  });

  it('counts evaluations and non-compliance findings within the report month only', () => {
    const evaluations = [
      { company_id: COMPANY_A, status: 'evidence_current', evaluated_at: '2026-08-15' },
      { company_id: COMPANY_A, status: 'potential_noncompliance', evaluated_at: '2026-08-20' },
      { company_id: COMPANY_A, status: 'confirmed_noncompliance', evaluated_at: '2026-07-01' }, // outside the month
      { company_id: COMPANY_B, status: 'confirmed_noncompliance', evaluated_at: '2026-08-20' }, // different company
    ];
    const m = computeGovernanceMetrics(COMPANY_A, 2026, 7, [], [], [], [], evaluations, [], []); // month index 7 = August
    expect(m.legalEvaluationsThisMonth).toBe(2);
    expect(m.legalEvaluationsNonComplianceThisMonth).toBe(1);
  });

  it('excludes draft and abandoned objectives from both total and on-track', () => {
    const objectives = [
      { company_id: COMPANY_A, status: 'on_track' }, { company_id: COMPANY_A, status: 'at_risk' },
      { company_id: COMPANY_A, status: 'draft' }, { company_id: COMPANY_A, status: 'abandoned' },
      { company_id: COMPANY_B, status: 'achieved' },
    ];
    const m = computeGovernanceMetrics(COMPANY_A, 2026, 8, [], [], [], [], [], objectives, []);
    expect(m.objectivesTotal).toBe(2);
    expect(m.objectivesOnTrack).toBe(1);
  });

  it('reports findings opened/closed this month and the point-in-time open count', () => {
    const findings = [
      { company_id: COMPANY_A, created_at: '2026-08-05', closed_at: null },              // opened this month, still open
      { company_id: COMPANY_A, created_at: '2026-07-01', closed_at: '2026-08-10' },       // closed this month
      { company_id: COMPANY_A, created_at: '2026-06-01', closed_at: '2026-06-15' },       // neither opened nor closed this month
      { company_id: COMPANY_B, created_at: '2026-08-05', closed_at: null },               // different company
    ];
    const m = computeGovernanceMetrics(COMPANY_A, 2026, 7, [], [], [], [], [], [], findings);
    expect(m.auditFindingsOpenedThisMonth).toBe(1);
    expect(m.auditFindingsClosedThisMonth).toBe(1);
    expect(m.auditFindingsOpen).toBe(1); // only the still-open one counts, regardless of month
  });
});
