import { describe, expect, it } from 'vitest';
import { computeConsultantMetrics } from '../consultantMetrics';

const PERIOD = { from: '2026-09-01', to: '2026-09-30' };

describe('computeConsultantMetrics', () => {
  it('counts visits completed and reports issued within the period only', () => {
    const m = computeConsultantMetrics({
      visits: [
        { id: 'v1', client_organisation_id: 'co-a', scheduled_date: '2026-09-10', status: 'report_issued' },
        { id: 'v2', client_organisation_id: 'co-a', scheduled_date: '2026-08-01', status: 'report_issued' }, // outside period
        { id: 'v3', client_organisation_id: 'co-a', scheduled_date: '2026-09-15', status: 'planned' },       // not completed
      ],
      reports: [{ id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', status: 'issued', issued_at: '2026-09-12T00:00:00Z', next_visit_recommended_date: null }],
      observations: [], actions: [],
    }, PERIOD);
    expect(m.visitsCompleted).toBe(1);
    expect(m.reportsIssued).toBe(1);
  });

  it('averages the visit-to-report lag in whole-ish days', () => {
    const m = computeConsultantMetrics({
      visits: [
        { id: 'v1', client_organisation_id: 'co-a', scheduled_date: '2026-09-01', status: 'report_issued' },
        { id: 'v2', client_organisation_id: 'co-a', scheduled_date: '2026-09-05', status: 'report_issued' },
      ],
      reports: [
        { id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', status: 'issued', issued_at: '2026-09-03T00:00:00Z', next_visit_recommended_date: null }, // 2 days
        { id: 'r2', visit_id: 'v2', client_organisation_id: 'co-a', status: 'issued', issued_at: '2026-09-09T00:00:00Z', next_visit_recommended_date: null }, // 4 days
      ],
      observations: [], actions: [],
    }, PERIOD);
    expect(m.avgDaysVisitToReportIssued).toBe(3);
  });

  it('null when no reports were issued in the period', () => {
    const m = computeConsultantMetrics({ visits: [], reports: [], observations: [], actions: [] }, PERIOD);
    expect(m.avgDaysVisitToReportIssued).toBeNull();
  });

  it('breaks observations down by type, period-scoped', () => {
    const m = computeConsultantMetrics({
      visits: [], reports: [],
      observations: [
        { observation_type: 'positive', created_at: '2026-09-10T00:00:00Z' },
        { observation_type: 'positive', created_at: '2026-09-11T00:00:00Z' },
        { observation_type: 'nonconformance', created_at: '2026-09-12T00:00:00Z' },
        { observation_type: 'observation', created_at: '2026-08-01T00:00:00Z' }, // outside period
      ],
      actions: [],
    }, PERIOD);
    expect(m.observationsRecorded).toBe(3);
    expect(m.observationsByType).toEqual({ positive: 2, nonconformance: 1 });
  });

  it('only counts consultant_visit-sourced actions, period-scoped for raised/closed', () => {
    const m = computeConsultantMetrics({
      visits: [], reports: [], observations: [],
      actions: [
        { source_type: 'consultant_visit', status: 'active', created_at: '2026-09-05T00:00:00Z', completed_at: null },
        { source_type: 'consultant_visit', status: 'complete', created_at: '2026-08-01T00:00:00Z', completed_at: '2026-09-06T00:00:00Z' },
        { source_type: 'hs_check', status: 'active', created_at: '2026-09-05T00:00:00Z', completed_at: null }, // wrong source
      ],
    }, PERIOD);
    expect(m.actionsRaised).toBe(1);
    expect(m.actionsClosed).toBe(1);
  });

  it('follow-up compliance is NOT period-scoped, and only counts issued reports with a recommendation', () => {
    const m = computeConsultantMetrics({
      visits: [{ id: 'v2', client_organisation_id: 'co-a', scheduled_date: '2027-01-01', status: 'planned' }],
      reports: [
        { id: 'r1', visit_id: 'v1', client_organisation_id: 'co-a', status: 'issued', issued_at: '2026-01-01T00:00:00Z', next_visit_recommended_date: '2026-06-01' }, // booked (v2)
        { id: 'r2', visit_id: 'v3', client_organisation_id: 'co-b', status: 'issued', issued_at: '2026-01-01T00:00:00Z', next_visit_recommended_date: '2026-06-01' }, // outstanding
        { id: 'r3', visit_id: 'v4', client_organisation_id: 'co-a', status: 'draft', issued_at: null, next_visit_recommended_date: '2026-06-01' }, // not issued, excluded
        { id: 'r4', visit_id: 'v5', client_organisation_id: 'co-a', status: 'issued', issued_at: '2026-01-01T00:00:00Z', next_visit_recommended_date: null }, // no recommendation
      ],
      observations: [], actions: [],
    }, PERIOD);
    expect(m.followUpsBooked).toBe(1);
    expect(m.followUpsOutstanding).toBe(1);
  });
});
