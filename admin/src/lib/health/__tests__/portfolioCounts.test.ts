import { describe, expect, it } from 'vitest';
import { computePortfolioCounts } from '../portfolioCounts';

const TODAY = new Date('2026-09-29T00:00:00Z');

const empty = {
  actions: [], legalObligations: [], documentsReviewDue: [], incidents: [],
  deploymentStatus: [], equipment: [], auditFindings: [], contractors: [],
  contractorInsurances: [], environmentalPermits: [], managementReviews: [],
  serviceRequests: [], consultancyVisits: [],
};

describe('computePortfolioCounts', () => {
  it('returns all-zero, null-visit counts for a company with no signal', () => {
    const out = computePortfolioCounts(['co-a'], TODAY, empty);
    expect(out.get('co-a')).toEqual({
      open_critical_actions: 0, overdue_legal_evaluations: 0, overdue_controlled_documents: 0,
      open_incident_investigations: 0, safety_critical_gaps: 0, workers_not_ready: 0,
      assets_unavailable: 0, major_audit_findings: 0, contractor_expiring: 0,
      environmental_permits_expiring: 0, management_reviews_due: 0, outstanding_service_requests: 0,
      next_consultant_visit_date: null,
    });
  });

  it('counts an open, high/critical-severity action but not a closed or low-severity one', () => {
    const out = computePortfolioCounts(['co-a'], TODAY, {
      ...empty,
      actions: [
        { company_id: 'co-a', status: 'active', severity: 'critical' },
        { company_id: 'co-a', status: 'complete', severity: 'critical' },
        { company_id: 'co-a', status: 'active', severity: 'low' },
        { company_id: 'co-a', status: 'awaiting_verification', severity: 'high' },
      ],
    });
    expect(out.get('co-a')!.open_critical_actions).toBe(2);
  });

  it('overdue legal evaluations only counts applicable obligations past their own review date', () => {
    const out = computePortfolioCounts(['co-a'], TODAY, {
      ...empty,
      legalObligations: [
        { company_id: 'co-a', applicability_status: 'applicable', next_review_due: '2026-01-01' }, // overdue
        { company_id: 'co-a', applicability_status: 'applicable', next_review_due: '2099-01-01' }, // not yet due
        { company_id: 'co-a', applicability_status: 'not_applicable', next_review_due: '2026-01-01' }, // not applicable
        { company_id: 'co-a', applicability_status: 'under_review', next_review_due: null },
      ],
    });
    expect(out.get('co-a')!.overdue_legal_evaluations).toBe(1);
  });

  it('a contractor is flagged once whether by non-approval, an expiring policy, or both', () => {
    const out = computePortfolioCounts(['co-a'], TODAY, {
      ...empty,
      contractors: [
        { id: 'c1', company_id: 'co-a', approval_status: 'suspended' },
        { id: 'c2', company_id: 'co-a', approval_status: 'approved' },
        { id: 'c3', company_id: 'co-a', approval_status: 'approved' },
        { id: 'c4', company_id: 'co-a', approval_status: 'approved' }, // clean — no flag
      ],
      contractorInsurances: [
        { contractor_id: 'c1', expires_on: '2026-10-01' }, // already flagged by suspension — no double count
        { contractor_id: 'c2', expires_on: '2026-10-01' }, // within 30 days of TODAY
        { contractor_id: 'c3', expires_on: '2099-01-01' }, // far future — not flagged
      ],
    });
    expect(out.get('co-a')!.contractor_expiring).toBe(2); // c1, c2 — c3 and c4 clean
  });

  it('an insurance row for a contractor outside the batch is never attributed to the wrong company', () => {
    const out = computePortfolioCounts(['co-a'], TODAY, {
      ...empty,
      contractors: [{ id: 'c1', company_id: 'co-a', approval_status: 'approved' }],
      contractorInsurances: [{ contractor_id: 'unknown-contractor', expires_on: '2026-10-01' }],
    });
    expect(out.get('co-a')!.contractor_expiring).toBe(0);
  });

  it('next_consultant_visit_date is the earliest SCHEDULED (never cancelled) future date', () => {
    const out = computePortfolioCounts(['co-a'], TODAY, {
      ...empty,
      consultancyVisits: [
        { client_organisation_id: 'co-a', status: 'scheduled', scheduled_date: '2026-11-04' },
        { client_organisation_id: 'co-a', status: 'scheduled', scheduled_date: '2026-10-20' },
        { client_organisation_id: 'co-a', status: 'cancelled', scheduled_date: '2026-10-01' },
        { client_organisation_id: 'co-a', status: 'scheduled', scheduled_date: '2026-01-01' }, // in the past
      ],
    });
    expect(out.get('co-a')!.next_consultant_visit_date).toBe('2026-10-20');
  });

  it('safety_critical_gaps reads the engine\'s own stored summary flag, never re-derives it', () => {
    const out = computePortfolioCounts(['co-a'], TODAY, {
      ...empty,
      deploymentStatus: [
        { company_id: 'co-a', status: 'READY', result: { summary: { safety_critical_gap: true } } }, // READY but flagged — still counts as a gap
        { company_id: 'co-a', status: 'REVIEW_REQUIRED', result: { summary: { safety_critical_gap: false } } },
        { company_id: 'co-a', status: 'REVIEW_REQUIRED', result: null },
      ],
    });
    expect(out.get('co-a')!.safety_critical_gaps).toBe(1);
    expect(out.get('co-a')!.workers_not_ready).toBe(2);
  });

  it('never attributes a count to a company outside the requested id list', () => {
    const out = computePortfolioCounts(['co-a'], TODAY, {
      ...empty,
      actions: [{ company_id: 'co-b', status: 'active', severity: 'critical' }],
    });
    expect(out.has('co-b')).toBe(false);
    expect(out.get('co-a')!.open_critical_actions).toBe(0);
  });
});
