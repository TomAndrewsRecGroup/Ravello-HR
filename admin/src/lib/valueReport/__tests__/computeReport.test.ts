import { describe, expect, it } from 'vitest';
import { computeValueReport } from '../computeReport';

const CO = 'co-1';
const empty = {
  requisitions: [], candidates: [], documents: [], complianceItems: [], serviceRequests: [], actions: [], profiles: [], companies: [],
  trainingNeeds: [], performanceReviews: [], absenceRecords: [], onboardingInstances: [],
  standards: [], standardClauses: [], standardEvidenceLinks: [], legalObligations: [], complianceEvaluations: [], objectives: [], auditFindings: [],
};

describe('computeValueReport', () => {
  it('counts roles raised and filled this month, and all-time totals regardless of month', () => {
    const requisitions = [
      { company_id: CO, stage: 'submitted', created_at: '2026-09-05', updated_at: '2026-09-05' },
      { company_id: CO, stage: 'filled', created_at: '2026-08-01', updated_at: '2026-09-10' },
      { company_id: CO, stage: 'filled', created_at: '2026-01-01', updated_at: '2026-01-05' },
      { company_id: 'co-2', stage: 'submitted', created_at: '2026-09-05', updated_at: '2026-09-05' },
    ];
    const r = computeValueReport(CO, 2026, 8, { ...empty, requisitions });
    expect(r.hire.newRoles).toBe(1);
    expect(r.hire.filled).toBe(1); // filled AND updated this month
    expect(r.hire.totalFilled).toBe(2); // all-time, any month
    expect(r.hire.activeRoles).toBe(1); // the one still submitted
  });

  it('computes average service-request response hours for requests responded to this month', () => {
    const serviceRequests = [
      { company_id: CO, status: 'complete', created_at: '2026-09-01T00:00:00Z', responded_at: '2026-09-01T10:00:00Z' },
      { company_id: CO, status: 'complete', created_at: '2026-09-02T00:00:00Z', responded_at: '2026-09-02T20:00:00Z' },
    ];
    const r = computeValueReport(CO, 2026, 8, { ...empty, serviceRequests });
    expect(r.support.avgResponseHours).toBe(15); // (10 + 20) / 2
    expect(r.support.serviceRequestsResponded).toBe(2);
  });

  it('reports MRR from the company\'s own real retainer, in pounds', () => {
    const companies = [
      { id: CO, monthly_retainer_pence: 75000 },
      { id: 'co-2', monthly_retainer_pence: 99900 },
    ];
    const r = computeValueReport(CO, 2026, 8, { ...empty, companies });
    expect(r.usage.mrr).toBe(750);
  });

  it('reports zero MRR for a company with no retainer on file', () => {
    const companies = [{ id: CO, monthly_retainer_pence: null }];
    const r = computeValueReport(CO, 2026, 8, { ...empty, companies });
    expect(r.usage.mrr).toBe(0);
  });

  it('includes a lead section computed the same way computeLeadMetrics does standalone', () => {
    const trainingNeeds = [{ company_id: CO, status: 'open', created_at: '2026-09-01', updated_at: '2026-09-01' }];
    const r = computeValueReport(CO, 2026, 8, { ...empty, trainingNeeds });
    expect(r.lead.trainingNeedsFlagged).toBe(1);
  });

  it('returns all zeros for a company with no rows anywhere', () => {
    const r = computeValueReport('nope', 2026, 8, empty);
    expect(r.hire).toEqual({ newRoles: 0, filled: 0, candidates: 0, activeRoles: 0, totalFilled: 0 });
    expect(r.support.avgResponseHours).toBe(0);
    expect(r.usage.mrr).toBe(0);
    expect(r.governance.auditFindingsOpen).toBe(0);
    expect(r.governance.isoReadiness).toEqual([]);
  });

  it('includes a governance section computed the same way computeGovernanceMetrics does standalone', () => {
    const standards = [{ id: 'std-1', code: 'iso_45001_2018' }];
    const standardClauses = [{ id: 'clause-1', standard_id: 'std-1' }];
    const standardEvidenceLinks = [{ company_id: CO, clause_id: 'clause-1' }];
    const objectives = [{ company_id: CO, status: 'on_track' }];
    const r = computeValueReport(CO, 2026, 8, { ...empty, standards, standardClauses, standardEvidenceLinks, objectives });
    expect(r.governance.isoReadiness).toEqual([{ standardCode: 'iso_45001_2018', clausesTotal: 1, clausesWithEvidence: 1 }]);
    expect(r.governance.objectivesOnTrack).toBe(1);
  });
});
