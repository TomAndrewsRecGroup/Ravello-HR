import { describe, expect, it } from 'vitest';
import { calculateLeaveBalance, normaliseAbsenceRows, type AbsenceLeaveRow } from '../leaveCalculations';

// Leave used to live in two tables that never met: the leave link, the
// Absence page and approve/deny wrote `absence_records`, while the
// calendar, HR Reports and Employee Records read `leave_records`. Leave
// approved through the link never reached a balance. Those screens now
// read absence_records — whose vocabulary is 'holiday' / 'sick', not
// the old enum's 'annual_leave' / 'sick_day' — so these pin that a row
// written by the leave link is actually counted.

const config = {
  leave_year_type: 'fixed' as const,
  leave_year_start_month: 1,
  leave_year_start_day: 1,
  start_date: '2020-01-01',
  annual_leave_allowance: 25,
  sick_day_allowance: 10,
};
const REF = new Date('2026-06-15');

function row(p: Partial<AbsenceLeaveRow>): AbsenceLeaveRow {
  return {
    id: 'r', employee_id: 'e-1', employee_name: 'Sample Person', leave_type: 'holiday',
    start_date: '2026-03-02', end_date: '2026-03-06', days_count: 5, status: 'approved',
    ...p,
  };
}

describe('absence_records rows count toward leave balances', () => {
  it("counts the leave link's 'holiday' as annual leave", () => {
    const b = calculateLeaveBalance(config, normaliseAbsenceRows([row({})]), REF);
    expect(b.annualLeaveTaken).toBe(5);
    expect(b.annualLeaveRemaining).toBe(20);
  });

  it("counts 'sick' as sick days and pending holiday as pending", () => {
    const b = calculateLeaveBalance(config, normaliseAbsenceRows([
      row({ leave_type: 'sick', days_count: 2 }),
      row({ id: 'p', status: 'pending', days_count: 3 }),
    ]), REF);
    expect(b.sickDaysTaken).toBe(2);
    expect(b.annualLeavePending).toBe(3);
    expect(b.annualLeaveTaken).toBe(0);
  });

  it('still counts a legacy annual_leave / sick_day row', () => {
    const b = calculateLeaveBalance(config, normaliseAbsenceRows([
      row({ leave_type: 'annual_leave', days_count: 1 }),
      row({ leave_type: 'sick_day', days_count: 1 }),
    ]), REF);
    expect(b.annualLeaveTaken).toBe(1);
    expect(b.sickDaysTaken).toBe(1);
  });
});

describe('normaliseAbsenceRows', () => {
  it('fills a blank end date and day count (the manual Absence form allows both)', () => {
    const [r] = normaliseAbsenceRows([row({ end_date: null, days_count: null })]);
    expect(r.end_date).toBe('2026-03-02');
    expect(r.days_count).toBe(1);
  });

  it('derives an inclusive span when only the count is blank', () => {
    const [r] = normaliseAbsenceRows([row({ days_count: null })]);
    expect(r.days_count).toBe(5);
  });

  it('keeps a stored half day and parses numeric strings from PostgREST', () => {
    expect(normaliseAbsenceRows([row({ days_count: 0.5 })])[0].days_count).toBe(0.5);
    expect(normaliseAbsenceRows([row({ days_count: '2.5' })])[0].days_count).toBe(2.5);
  });

  it('falls back to the free-text name for rows with no employee link', () => {
    const [r] = normaliseAbsenceRows([row({ employee_id: null, employee_records: null })]);
    expect(r.employee_records.full_name).toBe('Sample Person');
  });
});
