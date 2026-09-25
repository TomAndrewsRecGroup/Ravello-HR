// Derives hr_metrics figures from employee_records + absence_records
// instead of relying on hand entry (the HR Dashboard's manual upsert
// form still exists — this fills it, the client reviews and saves).
//
// All figures are computed over the TRAILING 12 MONTHS ending on
// `asOf`, and "current" figures (headcount, gender split, tenure) as
// of `asOf` itself. hr_metrics.period is free text ("2026-Q1",
// "Annual 2025") with no parseable date range, so a precise per-period
// recompute isn't possible from the column alone — this computes the
// CURRENT trailing-12-month picture, which is what "auto-calculate"
// means in the form: fill today's real numbers, not reconstruct an
// arbitrary past period.

export interface EmployeeRecordRow {
  status: string;
  start_date: string;
  end_date: string | null;
  gender: string | null;
}

export interface AbsenceRecordRow {
  status: string;
  start_date: string;
  days: number | null;
}

export interface HrMetricsSnapshot {
  headcount: number;
  turnoverRate: number | null;
  absenceRate: number | null;
  genderMPct: number | null;
  genderFPct: number | null;
  genderOtherPct: number | null;
  avgTenureMonths: number | null;
}

const MS_PER_DAY = 86_400_000;
const WORKING_DAYS_PER_YEAR = 260; // 5-day week, no bank-holiday adjustment

function activeAt(e: EmployeeRecordRow, at: Date): boolean {
  const start = new Date(e.start_date);
  if (start > at) return false;
  if (!e.end_date) return true;
  return new Date(e.end_date) > at;
}

function genderBucket(g: string | null): 'm' | 'f' | 'other' {
  const v = (g ?? '').trim().toLowerCase();
  if (v === 'male' || v === 'm') return 'm';
  if (v === 'female' || v === 'f') return 'f';
  return 'other';
}

/** Whole calendar months between two dates (not calendar-day-precise,
 *  which is the right granularity for a tenure figure in months). */
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function computeHrMetrics(
  employeeRecords: EmployeeRecordRow[],
  absenceRecords: AbsenceRecordRow[],
  asOf: Date,
): HrMetricsSnapshot {
  const yearAgo = new Date(asOf.getTime() - 365 * MS_PER_DAY);

  const currentlyActive = employeeRecords.filter(e => activeAt(e, asOf));
  const headcount = currentlyActive.length;

  const activeAYearAgo = employeeRecords.filter(e => activeAt(e, yearAgo)).length;
  const avgHeadcount = (headcount + activeAYearAgo) / 2;

  const leaversInYear = employeeRecords.filter(e =>
    e.end_date && new Date(e.end_date) > yearAgo && new Date(e.end_date) <= asOf,
  ).length;
  const turnoverRate = avgHeadcount > 0 ? Math.round((leaversInYear / avgHeadcount) * 1000) / 10 : null;

  const absenceDaysInYear = absenceRecords
    .filter(a => a.status === 'approved' && new Date(a.start_date) > yearAgo && new Date(a.start_date) <= asOf)
    .reduce((sum, a) => sum + (Number(a.days) || 0), 0);
  const possibleDays = avgHeadcount * WORKING_DAYS_PER_YEAR;
  const absenceRate = possibleDays > 0 ? Math.round((absenceDaysInYear / possibleDays) * 1000) / 10 : null;

  let genderMPct: number | null = null, genderFPct: number | null = null, genderOtherPct: number | null = null;
  if (headcount > 0) {
    const counts = { m: 0, f: 0, other: 0 };
    for (const e of currentlyActive) counts[genderBucket(e.gender)]++;
    genderMPct = Math.round((counts.m / headcount) * 1000) / 10;
    genderFPct = Math.round((counts.f / headcount) * 1000) / 10;
    genderOtherPct = Math.round((counts.other / headcount) * 1000) / 10;
  }

  const avgTenureMonths = headcount > 0
    ? Math.round(currentlyActive.reduce((sum, e) => sum + monthsBetween(new Date(e.start_date), asOf), 0) / headcount)
    : null;

  return { headcount, turnoverRate, absenceRate, genderMPct, genderFPct, genderOtherPct, avgTenureMonths };
}
