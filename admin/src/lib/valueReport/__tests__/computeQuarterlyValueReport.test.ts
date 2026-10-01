import { describe, expect, it } from 'vitest';
import { computeQuarterlyValueReport, quarterMonths } from '../computeReport';

const CO = 'co-1';
const empty = {
  requisitions: [], candidates: [], tickets: [], documents: [], complianceItems: [], serviceRequests: [], actions: [], profiles: [], companies: [],
  trainingNeeds: [], performanceReviews: [], absenceRecords: [], onboardingInstances: [],
  standards: [], standardClauses: [], standardEvidenceLinks: [], legalObligations: [], complianceEvaluations: [], objectives: [], auditFindings: [],
};

describe('quarterMonths', () => {
  it('maps each quarter to its three zero-indexed months', () => {
    expect(quarterMonths(2026, 1)).toEqual([0, 1, 2]);
    expect(quarterMonths(2026, 2)).toEqual([3, 4, 5]);
    expect(quarterMonths(2026, 3)).toEqual([6, 7, 8]);
    expect(quarterMonths(2026, 4)).toEqual([9, 10, 11]);
  });
});

describe('computeQuarterlyValueReport', () => {
  it('sums a FLOW field (new roles) across all three months of the quarter', () => {
    const requisitions = [
      { company_id: CO, stage: 'submitted', created_at: '2026-07-05', updated_at: '2026-07-05' }, // July
      { company_id: CO, stage: 'submitted', created_at: '2026-08-05', updated_at: '2026-08-05' }, // August
      { company_id: CO, stage: 'submitted', created_at: '2026-09-05', updated_at: '2026-09-05' }, // September
      { company_id: CO, stage: 'submitted', created_at: '2026-06-05', updated_at: '2026-06-05' }, // June — outside Q3
    ];
    const r = computeQuarterlyValueReport(CO, 2026, 3, { ...empty, requisitions });
    expect(r.hire.newRoles).toBe(3);
  });

  it('never triple-counts a STOCK field (active roles) — takes the quarter\'s last month only', () => {
    const requisitions = [
      { company_id: CO, stage: 'submitted', created_at: '2026-05-01', updated_at: '2026-05-01' }, // outside the quarter, still active
    ];
    const r = computeQuarterlyValueReport(CO, 2026, 3, { ...empty, requisitions });
    // activeRoles is period-independent (counts ALL non-filled/cancelled
    // requisitions regardless of month) — a naive x3 sum would wrongly
    // report 3, not 1.
    expect(r.hire.activeRoles).toBe(1);
  });

  it('reviewsOverdue is read from the quarter\'s LAST month only, never summed — a review overdue all quarter must not be counted three times', () => {
    const performanceReviews = [
      { company_id: CO, status: 'pending', due_date: '2026-06-01', completed_at: null, created_at: '2026-05-01' }, // overdue by the start of Q3 already
    ];
    const r = computeQuarterlyValueReport(CO, 2026, 3, { ...empty, performanceReviews });
    expect(r.lead.reviewsOverdue).toBe(1); // not 3
  });

  it('sums FLOW lead/governance fields but takes STOCK ones from the last month', () => {
    const trainingNeeds = [
      { company_id: CO, status: 'open', created_at: '2026-07-01', updated_at: '2026-07-01' },
      { company_id: CO, status: 'in_progress', created_at: '2026-08-01', updated_at: '2026-08-01' },
    ];
    const objectives = [{ company_id: CO, status: 'on_track' }];
    const r = computeQuarterlyValueReport(CO, 2026, 3, { ...empty, trainingNeeds, objectives });
    expect(r.lead.trainingNeedsFlagged).toBe(2); // flow, summed
    expect(r.lead.trainingNeedsOpen).toBe(2); // stock, from last month — but period-independent so still 2
    expect(r.governance.objectivesOnTrack).toBe(1); // stock, period-independent
  });

  it('usage (portal users, MRR) is taken wholesale from the last month, never summed', () => {
    const companies = [{ id: CO, monthly_retainer_pence: 50000 }];
    const r = computeQuarterlyValueReport(CO, 2026, 3, { ...empty, companies });
    expect(r.usage.mrr).toBe(500); // not 1500
  });

  it('averages the three months\' own avgResolutionHours rather than recomputing from raw tickets', () => {
    const tickets = [
      { company_id: CO, status: 'resolved', created_at: '2026-07-01T00:00:00Z', resolved_at: '2026-07-01T10:00:00Z' }, // 10h in July
      { company_id: CO, status: 'resolved', created_at: '2026-09-01T00:00:00Z', resolved_at: '2026-09-01T20:00:00Z' }, // 20h in September
    ];
    const r = computeQuarterlyValueReport(CO, 2026, 3, { ...empty, tickets });
    // July avg=10, August avg=0 (nothing resolved), September avg=20 -> (10+0+20)/3 = 10
    expect(r.support.avgResolutionHours).toBe(10);
    expect(r.support.ticketsResolved).toBe(2); // flow, summed
  });

  it('returns all zeros for a company with no rows anywhere', () => {
    const r = computeQuarterlyValueReport('nope', 2026, 3, empty);
    expect(r.hire).toEqual({ newRoles: 0, filled: 0, candidates: 0, activeRoles: 0, totalFilled: 0 });
    expect(r.governance.isoReadiness).toEqual([]);
  });
});
