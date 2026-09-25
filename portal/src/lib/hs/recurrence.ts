import type { HsRecurrenceUnit } from './vocab';

// The next due date after a completion. Mirror of SQL hs_next_due()
// (migration 095), which is what actually rolls the register forward;
// this copy exists so a form can show "next due" before saving.
// recurrence.test.ts pins both against the same cases.
//
// Month and year steps CLAMP to the end of the month, as Postgres
// date + interval does: 31 Jan + 1 month = 28/29 Feb, never 3 Mar.
// Dates are plain YYYY-MM-DD strings and all arithmetic is UTC, so a
// clock change can never shift a due date by a day.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function nextDue(from: string, every: number | null, unit: HsRecurrenceUnit | null): string | null {
  if (!every || !unit) return null;
  const m = ISO.exec(from);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);

  if (unit === 'day' || unit === 'week') {
    const t = Date.UTC(y, mo, d) + (unit === 'week' ? every * 7 : every) * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }
  const months = unit === 'year' ? every * 12 : every;
  const target = mo + months;
  const ty = y + Math.floor(target / 12);
  const tm = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** "Every 12 months", "Weekly" … for display. */
export function describeRecurrence(every: number | null, unit: HsRecurrenceUnit | null): string {
  if (!every || !unit) return 'One-off';
  if (every === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[unit];
  return `Every ${every} ${unit}s`;
}

/** Days from today (UTC) to a YYYY-MM-DD date; negative when past. */
export function daysUntil(date: string, today: string = new Date().toISOString().slice(0, 10)): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export type Rag = 'red' | 'amber' | 'green' | 'complete' | 'none';

/** Red once overdue, amber within 30 days, green otherwise. Day 0 (due today) is amber, not red. */
export function ragFor(status: string, dueDate: string | null, today?: string): Rag {
  if (status === 'complete') return 'complete';
  if (!dueDate) return 'none';
  const d = daysUntil(dueDate, today);
  if (d < 0) return 'red';
  if (d <= 30) return 'amber';
  return 'green';
}
