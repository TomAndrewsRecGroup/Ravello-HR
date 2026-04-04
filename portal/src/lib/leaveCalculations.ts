/**
 * Leave balance calculation utilities.
 *
 * Supports two leave year types:
 * - 'rolling': 12 months from the employee's start date
 * - 'fixed': a fixed period starting on a given month/day each year
 *
 * For fixed years, pro-rata is calculated when the employee starts mid-year.
 */

export interface LeaveYearConfig {
  leave_year_type: 'rolling' | 'fixed';
  leave_year_start_month: number; // 1-12
  leave_year_start_day: number;   // 1-31
  start_date: string;             // employee start date (ISO)
  annual_leave_allowance: number;
  sick_day_allowance: number | null;
}

export interface LeaveYearPeriod {
  start: string; // ISO date
  end: string;   // ISO date
  isProRata: boolean;
  proRataFraction: number; // 0-1
  annualLeaveEntitlement: number;
  sickDayEntitlement: number | null;
}

/**
 * Get the current leave year period for an employee.
 */
export function getCurrentLeaveYear(config: LeaveYearConfig, referenceDate?: Date): LeaveYearPeriod {
  const ref = referenceDate ?? new Date();
  const empStart = new Date(config.start_date + 'T12:00:00');

  if (config.leave_year_type === 'rolling') {
    return getRollingLeaveYear(config, empStart, ref);
  }
  return getFixedLeaveYear(config, empStart, ref);
}

function getRollingLeaveYear(config: LeaveYearConfig, empStart: Date, ref: Date): LeaveYearPeriod {
  // Rolling: 12 months from start date anniversary
  const startMonth = empStart.getMonth();
  const startDay = empStart.getDate();

  let yearStart = clampDay(ref.getFullYear(), startMonth, startDay);
  if (yearStart > ref) {
    yearStart = clampDay(ref.getFullYear() - 1, startMonth, startDay);
  }
  const yearEnd = clampDay(yearStart.getFullYear() + 1, startMonth, startDay);
  yearEnd.setDate(yearEnd.getDate() - 1);

  return {
    start: toISO(yearStart),
    end: toISO(yearEnd),
    isProRata: false,
    proRataFraction: 1,
    annualLeaveEntitlement: config.annual_leave_allowance,
    sickDayEntitlement: config.sick_day_allowance,
  };
}

function getFixedLeaveYear(config: LeaveYearConfig, empStart: Date, ref: Date): LeaveYearPeriod {
  const leaveMonth = config.leave_year_start_month - 1; // 0-indexed
  const leaveDay = config.leave_year_start_day;

  // Find the current fixed leave year
  let yearStart = clampDay(ref.getFullYear(), leaveMonth, leaveDay);
  if (yearStart > ref) {
    yearStart = clampDay(ref.getFullYear() - 1, leaveMonth, leaveDay);
  }
  const yearEnd = clampDay(yearStart.getFullYear() + 1, leaveMonth, leaveDay);
  yearEnd.setDate(yearEnd.getDate() - 1);

  // Pro-rata: if employee started after the leave year start
  const effectiveStart = empStart > yearStart ? empStart : yearStart;
  const totalDaysInYear = daysBetween(yearStart, yearEnd) + 1;
  const daysRemaining = daysBetween(effectiveStart, yearEnd) + 1;
  const isProRata = empStart > yearStart;
  const fraction = isProRata ? daysRemaining / totalDaysInYear : 1;

  return {
    start: toISO(yearStart),
    end: toISO(yearEnd),
    isProRata,
    proRataFraction: Math.round(fraction * 1000) / 1000,
    annualLeaveEntitlement: Math.round(config.annual_leave_allowance * fraction * 10) / 10,
    sickDayEntitlement: config.sick_day_allowance != null
      ? Math.round(config.sick_day_allowance * fraction * 10) / 10
      : null,
  };
}

export interface LeaveBalance {
  leaveYear: LeaveYearPeriod;
  annualLeaveAllowance: number;  // total entitlement (pro-rata if applicable)
  annualLeaveTaken: number;
  annualLeaveRemaining: number;
  annualLeavePending: number;    // pending requests
  sickDayAllowance: number | null;
  sickDaysTaken: number;
  sickDaysRemaining: number | null;
  totalLeaveDays: number;        // all leave types combined
}

export interface LeaveRecordRow {
  leave_type: string;
  days_count: number;
  status: string;
  start_date: string;
  end_date: string;
}

/**
 * Calculate leave balance for an employee given their config and leave records.
 */
export function calculateLeaveBalance(
  config: LeaveYearConfig,
  leaveRecords: LeaveRecordRow[],
  referenceDate?: Date,
): LeaveBalance {
  const leaveYear = getCurrentLeaveYear(config, referenceDate);

  // Filter leave records within this leave year
  const inYear = leaveRecords.filter(r =>
    r.end_date >= leaveYear.start && r.start_date <= leaveYear.end
  );

  const approvedAnnual = inYear
    .filter(r => r.leave_type === 'annual_leave' && r.status === 'approved')
    .reduce((sum, r) => sum + r.days_count, 0);

  const pendingAnnual = inYear
    .filter(r => r.leave_type === 'annual_leave' && r.status === 'pending')
    .reduce((sum, r) => sum + r.days_count, 0);

  const approvedSick = inYear
    .filter(r => r.leave_type === 'sick_day' && (r.status === 'approved' || r.status === 'pending'))
    .reduce((sum, r) => sum + r.days_count, 0);

  const totalTaken = inYear
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + r.days_count, 0);

  return {
    leaveYear,
    annualLeaveAllowance: leaveYear.annualLeaveEntitlement,
    annualLeaveTaken: approvedAnnual,
    annualLeaveRemaining: Math.max(0, leaveYear.annualLeaveEntitlement - approvedAnnual),
    annualLeavePending: pendingAnnual,
    sickDayAllowance: leaveYear.sickDayEntitlement,
    sickDaysTaken: approvedSick,
    sickDaysRemaining: leaveYear.sickDayEntitlement != null
      ? Math.max(0, leaveYear.sickDayEntitlement - approvedSick)
      : null,
    totalLeaveDays: totalTaken,
  };
}

/* ─── Utilities ─────────────────────────────────────── */
function clampDay(year: number, month: number, day: number): Date {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, maxDay));
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
