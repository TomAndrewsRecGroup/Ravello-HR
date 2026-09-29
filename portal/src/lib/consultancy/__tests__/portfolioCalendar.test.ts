import { describe, expect, it } from 'vitest';
import { buildPortfolioCalendar } from '../portfolioCalendar';

const orgNames = new Map([['co-a', 'ABC Manufacturing']]);
const empty = {
  orgNames, visits: [], auditProgrammes: [], legalObligations: [], managementReviews: [],
  trainingExpiring: [], documentsReview: [], milestones: [], environmentalPermits: [],
  contractorInsurances: [], isoCertifications: [],
};

describe('buildPortfolioCalendar', () => {
  it('returns nothing when every source is empty', () => {
    expect(buildPortfolioCalendar(empty)).toEqual([]);
  });

  it('includes a planned or confirmed visit but not a cancelled one', () => {
    const out = buildPortfolioCalendar({
      ...empty,
      visits: [
        { id: 'v1', client_organisation_id: 'co-a', scheduled_date: '2026-11-04', visit_type: 'retained_visit', status: 'planned' },
        { id: 'v2', client_organisation_id: 'co-a', scheduled_date: '2026-11-05', visit_type: 'audit_visit', status: 'cancelled' },
        { id: 'v3', client_organisation_id: 'co-a', scheduled_date: '2026-11-06', visit_type: 'audit_visit', status: 'confirmed' },
        { id: 'v4', client_organisation_id: 'co-a', scheduled_date: '2026-11-07', visit_type: 'audit_visit', status: 'closed' },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: 'visit', date: '2026-11-04', clientName: 'ABC Manufacturing' });
    expect(out[1]).toMatchObject({ type: 'visit', date: '2026-11-06', clientName: 'ABC Manufacturing' });
  });

  it('resolves an unknown org id to a safe fallback name', () => {
    const out = buildPortfolioCalendar({
      ...empty,
      milestones: [{ id: 'm1', company_id: 'co-unknown', title: 'x', due_date: '2026-12-01' }],
    });
    expect(out[0].clientName).toBe('Unknown client');
  });

  it('sorts every event type together by date, earliest first', () => {
    const out = buildPortfolioCalendar({
      ...empty,
      visits: [{ id: 'v1', client_organisation_id: 'co-a', scheduled_date: '2026-12-01', visit_type: 'retained_visit', status: 'planned' }],
      milestones: [{ id: 'm1', company_id: 'co-a', title: 'x', due_date: '2026-10-01' }],
      auditProgrammes: [{ id: 'a1', company_id: 'co-a', name: 'Fire audit', next_due_date: '2026-11-01', active: true }],
    });
    expect(out.map(e => e.type)).toEqual(['roadmap_milestone', 'audit', 'visit']);
  });

  it('an inactive audit programme or a non-applicable legal obligation is excluded', () => {
    const out = buildPortfolioCalendar({
      ...empty,
      auditProgrammes: [{ id: 'a1', company_id: 'co-a', name: 'x', next_due_date: '2026-11-01', active: false }],
      legalObligations: [{ id: 'l1', company_id: 'co-a', next_review_due: '2026-11-01', applicability_status: 'not_applicable' }],
    });
    expect(out).toHaveLength(0);
  });

  it('contractor insurance and ISO certification expiries both classify as material_expiry', () => {
    const out = buildPortfolioCalendar({
      ...empty,
      contractorInsurances: [{ id: 'i1', company_id: 'co-a', insurance_type: 'employers_liability', expires_on: '2026-11-01' }],
      isoCertifications: [{ id: 'c1', company_id: 'co-a', certificate_number: 'ISO-1', expires_on: '2026-12-01' }],
    });
    expect(out.every(e => e.type === 'material_expiry')).toBe(true);
    expect(out).toHaveLength(2);
  });
});
