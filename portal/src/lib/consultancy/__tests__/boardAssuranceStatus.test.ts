import { describe, expect, it } from 'vitest';
import { classifyBoardAssuranceStatus, OVERDUE_GRACE_DAYS, type BoardAssuranceReportSummaryRow } from '../boardAssuranceStatus';

const ORGS = [{ organisation_id: 'org-a', name: 'Client A' }];
const TODAY = new Date('2026-08-20T00:00:00Z'); // Q3 2026, day 51 of the quarter

describe('classifyBoardAssuranceStatus', () => {
  it('a client with no board_assurance_reports row at all is missing', () => {
    const [status] = classifyBoardAssuranceStatus(ORGS, [], TODAY);
    expect(status.bucket).toBe('missing');
    expect(status.deteriorating).toBe(false);
    expect(status.latestIssued).toBeNull();
  });

  it('an issued report for the CURRENT quarter is current', () => {
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'org-a', year: 2026, quarter: 3, status: 'issued', issued_at: '2026-08-10T00:00:00Z', overall_band: 'green', trend: 'unchanged' },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, TODAY);
    expect(status.bucket).toBe('current');
    expect(status.deteriorating).toBe(false);
  });

  it('no current-quarter issued report, past the grace window, is overdue', () => {
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'org-a', year: 2026, quarter: 2, status: 'issued', issued_at: '2026-05-10T00:00:00Z', overall_band: 'green', trend: 'unchanged' },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, TODAY);
    expect(status.bucket).toBe('overdue');
  });

  it('still within the grace window at the start of a new quarter is NOT overdue', () => {
    const earlyInQuarter = new Date('2026-07-05T00:00:00Z'); // 4 days into Q3
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'org-a', year: 2026, quarter: 2, status: 'issued', issued_at: '2026-05-10T00:00:00Z', overall_band: 'green', trend: 'unchanged' },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, earlyInQuarter);
    expect(status.bucket).toBe('current');
  });

  it('exactly on the grace boundary is overdue (>= grace days, not >)', () => {
    const boundary = new Date(Date.UTC(2026, 6, 1 + OVERDUE_GRACE_DAYS));
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'org-a', year: 2026, quarter: 2, status: 'issued', issued_at: '2026-05-10T00:00:00Z', overall_band: 'green', trend: 'unchanged' },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, boundary);
    expect(status.bucket).toBe('overdue');
  });

  it('a DRAFT-only row for the current quarter still counts as everHadAnyReport but not currentPeriodIssued', () => {
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'org-a', year: 2026, quarter: 3, status: 'draft', issued_at: null, overall_band: 'amber', trend: null },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, TODAY);
    expect(status.bucket).toBe('overdue');
  });

  it('deteriorating is read from the latest ISSUED report\'s own trend, independent of bucket', () => {
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'org-a', year: 2026, quarter: 3, status: 'issued', issued_at: '2026-08-10T00:00:00Z', overall_band: 'amber', trend: 'declined' },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, TODAY);
    expect(status.bucket).toBe('current');
    expect(status.deteriorating).toBe(true);
  });

  it('a DRAFT row never counts toward deteriorating, even if it is the newest row', () => {
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'org-a', year: 2026, quarter: 2, status: 'issued', issued_at: '2026-05-10T00:00:00Z', overall_band: 'green', trend: 'improved' },
      { company_id: 'org-a', year: 2026, quarter: 3, status: 'draft', issued_at: null, overall_band: 'red', trend: 'declined' },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, TODAY);
    expect(status.deteriorating).toBe(false);
    expect(status.latestIssued?.quarter).toBe(2);
  });

  it('latestIssued picks the most recent by (year, quarter), not insertion order', () => {
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'org-a', year: 2025, quarter: 4, status: 'issued', issued_at: '2026-01-05T00:00:00Z', overall_band: 'green', trend: 'unchanged' },
      { company_id: 'org-a', year: 2026, quarter: 2, status: 'issued', issued_at: '2026-05-10T00:00:00Z', overall_band: 'amber', trend: 'declined' },
      { company_id: 'org-a', year: 2026, quarter: 1, status: 'issued', issued_at: '2026-02-02T00:00:00Z', overall_band: 'green', trend: 'improved' },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, TODAY);
    expect(status.latestIssued?.year).toBe(2026);
    expect(status.latestIssued?.quarter).toBe(2);
    expect(status.deteriorating).toBe(true);
  });

  it('rows for a DIFFERENT company never affect this one\'s classification', () => {
    const rows: BoardAssuranceReportSummaryRow[] = [
      { company_id: 'some-other-company', year: 2026, quarter: 3, status: 'issued', issued_at: '2026-08-10T00:00:00Z', overall_band: 'green', trend: 'unchanged' },
    ];
    const [status] = classifyBoardAssuranceStatus(ORGS, rows, TODAY);
    expect(status.bucket).toBe('missing');
  });
});
