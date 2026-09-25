import { describe, expect, it } from 'vitest';
import { computeHrMetrics } from '../hrMetricsFromRecords';

const ASOF = new Date('2026-09-25T00:00:00Z');

describe('computeHrMetrics', () => {
  it('counts an employee as current headcount when active on asOf, and excludes one who left before it', () => {
    const employees = [
      { status: 'active', start_date: '2020-01-01', end_date: null, gender: 'Female' },
      { status: 'terminated', start_date: '2020-01-01', end_date: '2026-01-01', gender: 'Male' },
    ];
    const m = computeHrMetrics(employees, [], ASOF);
    expect(m.headcount).toBe(1);
  });

  it('includes an employee whose end_date is in the future (not yet left)', () => {
    const employees = [{ status: 'active', start_date: '2020-01-01', end_date: '2027-01-01', gender: 'Female' }];
    const m = computeHrMetrics(employees, [], ASOF);
    expect(m.headcount).toBe(1);
  });

  it('excludes an employee who has not started yet', () => {
    const employees = [{ status: 'active', start_date: '2027-01-01', end_date: null, gender: 'Female' }];
    const m = computeHrMetrics(employees, [], ASOF);
    expect(m.headcount).toBe(0);
  });

  it('computes turnover rate from leavers in the trailing 12 months against average headcount', () => {
    // 4 active now, 1 left 6 months ago (was part of the year-ago headcount too), so:
    // headcount now = 4, headcount a year ago = 5, avg = 4.5, turnover = 1/4.5 = 22.2%
    const employees = [
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'Female' },
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'Male' },
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'Male' },
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'Female' },
      { status: 'terminated', start_date: '2018-01-01', end_date: '2026-03-01', gender: 'Male' },
    ];
    const m = computeHrMetrics(employees, [], ASOF);
    expect(m.turnoverRate).toBeCloseTo(22.2, 1);
  });

  it('a leaver more than a year ago does not count toward turnover', () => {
    const employees = [
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'Female' },
      { status: 'terminated', start_date: '2018-01-01', end_date: '2024-01-01', gender: 'Male' },
    ];
    const m = computeHrMetrics(employees, [], ASOF);
    expect(m.turnoverRate).toBe(0);
  });

  it('computes absence rate from approved absence days in the trailing year over possible working days', () => {
    const employees = [
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'Female' },
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'Male' },
    ];
    // avg headcount = 2, possible days = 2 * 260 = 520; 26 absence days -> 5%
    const absences = [
      { status: 'approved', start_date: '2026-06-01', days: 20 },
      { status: 'approved', start_date: '2026-07-01', days: 6 },
      { status: 'pending', start_date: '2026-07-01', days: 100 }, // not approved, excluded
      { status: 'approved', start_date: '2024-01-01', days: 50 }, // outside the trailing year, excluded
    ];
    const m = computeHrMetrics(employees, absences, ASOF);
    expect(m.absenceRate).toBeCloseTo(5, 1);
  });

  it('buckets gender case-insensitively and treats anything else as other', () => {
    const employees = [
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'male' },
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'FEMALE' },
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: 'Non-binary' },
      { status: 'active', start_date: '2018-01-01', end_date: null, gender: null },
    ];
    const m = computeHrMetrics(employees, [], ASOF);
    expect(m.genderMPct).toBeCloseTo(25, 1);
    expect(m.genderFPct).toBeCloseTo(25, 1);
    expect(m.genderOtherPct).toBeCloseTo(50, 1);
  });

  it('computes average tenure in whole months for currently active employees only', () => {
    const employees = [
      { status: 'active', start_date: '2025-09-25', end_date: null, gender: 'Male' }, // 12 months
      { status: 'active', start_date: '2026-03-25', end_date: null, gender: 'Female' }, // 6 months
      { status: 'terminated', start_date: '2010-01-01', end_date: '2020-01-01', gender: 'Male' }, // excluded
    ];
    const m = computeHrMetrics(employees, [], ASOF);
    expect(m.avgTenureMonths).toBe(9);
  });

  it('returns null percentages/rates rather than dividing by zero when there is no headcount', () => {
    const m = computeHrMetrics([], [], ASOF);
    expect(m.headcount).toBe(0);
    expect(m.turnoverRate).toBeNull();
    expect(m.absenceRate).toBeNull();
    expect(m.genderMPct).toBeNull();
    expect(m.avgTenureMonths).toBeNull();
  });
});
