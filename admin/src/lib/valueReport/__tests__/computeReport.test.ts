import { describe, expect, it } from 'vitest';
import { computeValueReport } from '../computeReport';

const CO = 'co-1';
const empty = { requisitions: [], candidates: [], tickets: [], documents: [], complianceItems: [], serviceRequests: [], actions: [], profiles: [], services: [], trainingNeeds: [], performanceReviews: [], absenceRecords: [], onboardingInstances: [] };

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

  it('computes average ticket resolution hours for tickets resolved this month', () => {
    const tickets = [
      { company_id: CO, status: 'resolved', created_at: '2026-09-01T00:00:00Z', resolved_at: '2026-09-01T10:00:00Z' },
      { company_id: CO, status: 'resolved', created_at: '2026-09-02T00:00:00Z', resolved_at: '2026-09-02T20:00:00Z' },
    ];
    const r = computeValueReport(CO, 2026, 8, { ...empty, tickets });
    expect(r.support.avgResolutionHours).toBe(15); // (10 + 20) / 2
    expect(r.support.ticketsResolved).toBe(2);
  });

  it('sums active service monthly fees into MRR regardless of month', () => {
    const services = [
      { company_id: CO, monthly_fee: 500 },
      { company_id: CO, monthly_fee: 250 },
      { company_id: 'co-2', monthly_fee: 999 },
    ];
    const r = computeValueReport(CO, 2026, 8, { ...empty, services });
    expect(r.usage.mrr).toBe(750);
    expect(r.usage.activeServices).toHaveLength(2);
  });

  it('includes a lead section computed the same way computeLeadMetrics does standalone', () => {
    const trainingNeeds = [{ company_id: CO, status: 'open', created_at: '2026-09-01', updated_at: '2026-09-01' }];
    const r = computeValueReport(CO, 2026, 8, { ...empty, trainingNeeds });
    expect(r.lead.trainingNeedsFlagged).toBe(1);
  });

  it('returns all zeros for a company with no rows anywhere', () => {
    const r = computeValueReport('nope', 2026, 8, empty);
    expect(r.hire).toEqual({ newRoles: 0, filled: 0, candidates: 0, activeRoles: 0, totalFilled: 0 });
    expect(r.support.avgResolutionHours).toBe(0);
    expect(r.usage.mrr).toBe(0);
  });
});
