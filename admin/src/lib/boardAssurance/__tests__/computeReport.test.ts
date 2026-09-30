import { describe, it, expect } from 'vitest';
import { computeBoardAssuranceReport, quarterEndDate, type BoardAssuranceReportInput } from '../computeReport';
import type { ComplianceTwinSnapshot } from '@/lib/complianceTwin/assemble';
import type { PortfolioCounts } from '@/lib/health/portfolioCounts';

const GREEN_TWIN: ComplianceTwinSnapshot = {
  overallBand: 'green',
  areas: [
    { area: 'safety', label: 'Safety (H&S)', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'governance', label: 'Governance & Environmental', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'risk_graph', label: 'Risk Graph', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'incident_patterns', label: 'Incident Patterns', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'evidence', label: 'Evidence Coverage', band: 'green', reasons: ['clean'], inputs: {} },
  ],
};

const AMBER_TWIN: ComplianceTwinSnapshot = { ...GREEN_TWIN, overallBand: 'amber' };
const RED_TWIN: ComplianceTwinSnapshot = { ...GREEN_TWIN, overallBand: 'red' };

const CLEAN_PORTFOLIO: PortfolioCounts = {
  open_critical_actions: 0,
  overdue_legal_evaluations: 0,
  overdue_controlled_documents: 0,
  open_incident_investigations: 0,
  safety_critical_gaps: 0,
  workers_not_ready: 0,
  assets_unavailable: 0,
  major_audit_findings: 0,
  contractor_expiring: 0,
  environmental_permits_expiring: 0,
  management_reviews_due: 0,
  outstanding_service_requests: 0,
  next_consultant_visit_date: null,
};

function baseInput(overrides: Partial<BoardAssuranceReportInput> = {}): BoardAssuranceReportInput {
  return {
    companyId: 'company-1',
    year: 2026,
    quarter: 3,
    generatedAt: '2026-10-01T00:00:00.000Z',
    complianceTwin: structuredClone(GREEN_TWIN),
    portfolioCounts: structuredClone(CLEAN_PORTFOLIO),
    latestManagementReview: null,
    priorReport: null,
    ...overrides,
  };
}

describe('computeBoardAssuranceReport', () => {
  it('assembles every input field into the output without recomputing anything', () => {
    const input = baseInput();
    const out = computeBoardAssuranceReport(input);
    expect(out.companyId).toBe('company-1');
    expect(out.year).toBe(2026);
    expect(out.quarter).toBe(3);
    expect(out.overallBand).toBe('green');
    expect(out.complianceTwin).toEqual(GREEN_TWIN);
    expect(out.portfolioCounts).toEqual(CLEAN_PORTFOLIO);
  });

  it('trend is null with no prior stored report — never guessed', () => {
    const out = computeBoardAssuranceReport(baseInput({ priorReport: null }));
    expect(out.trend).toBeNull();
    expect(out.priorPeriod).toBeNull();
  });

  it('is "improved" when the overall band is less severe than the prior report', () => {
    const out = computeBoardAssuranceReport(baseInput({
      complianceTwin: GREEN_TWIN,
      priorReport: { year: 2026, quarter: 2, overallBand: 'red' },
    }));
    expect(out.trend).toBe('improved');
    expect(out.priorPeriod).toEqual({ year: 2026, quarter: 2 });
  });

  it('is "declined" when the overall band is more severe than the prior report', () => {
    const out = computeBoardAssuranceReport(baseInput({
      complianceTwin: RED_TWIN,
      priorReport: { year: 2026, quarter: 2, overallBand: 'green' },
    }));
    expect(out.trend).toBe('declined');
  });

  it('is "unchanged" when the band is the same as the prior report', () => {
    const out = computeBoardAssuranceReport(baseInput({
      complianceTwin: AMBER_TWIN,
      priorReport: { year: 2026, quarter: 2, overallBand: 'amber' },
    }));
    expect(out.trend).toBe('unchanged');
  });

  it('carries the latest management review through unchanged, or null when none is completed yet', () => {
    const withReview = computeBoardAssuranceReport(baseInput({
      latestManagementReview: {
        reviewDate: '2026-08-15',
        decisions: [{ topic: 'Fire safety', decisionText: 'Reissue the fire risk assessment' }],
      },
    }));
    expect(withReview.latestManagementReview?.decisions).toHaveLength(1);

    const withoutReview = computeBoardAssuranceReport(baseInput({ latestManagementReview: null }));
    expect(withoutReview.latestManagementReview).toBeNull();
  });

  it('trend severity ordering treats green as least severe and red as most severe, amber in between', () => {
    // green -> amber is a decline, not an improvement
    expect(computeBoardAssuranceReport(baseInput({
      complianceTwin: AMBER_TWIN, priorReport: { year: 2026, quarter: 2, overallBand: 'green' },
    })).trend).toBe('declined');
    // red -> amber is an improvement, not a decline
    expect(computeBoardAssuranceReport(baseInput({
      complianceTwin: AMBER_TWIN, priorReport: { year: 2026, quarter: 2, overallBand: 'red' },
    })).trend).toBe('improved');
  });
});

describe('quarterEndDate', () => {
  it('returns the last calendar day of each quarter', () => {
    expect(quarterEndDate(2026, 1)).toBe('2026-03-31');
    expect(quarterEndDate(2026, 2)).toBe('2026-06-30');
    expect(quarterEndDate(2026, 3)).toBe('2026-09-30');
  });

  it('rolls Q4 into 31 December of the SAME year, not January of the next', () => {
    expect(quarterEndDate(2026, 4)).toBe('2026-12-31');
  });

  it('accounts for a leap year February inside Q1', () => {
    expect(quarterEndDate(2028, 1)).toBe('2028-03-31'); // 2028 is a leap year; Q1 still ends 31 Mar
    expect(quarterEndDate(2027, 1)).toBe('2027-03-31'); // 2027 is not; result is unaffected either way
  });
});
