// Thursday 15:00 UK time, whatever the clocks are doing.
//
// Vercel crons run on UTC. 15:00 in London is 14:00 UTC in summer (BST)
// and 15:00 UTC in winter (GMT), so the cron fires on both UTC hours
// (and every 15 minutes after, to resume a send that ran out of time)
// and THIS module decides whether it is actually time. The week key is
// taken from the London date for the same reason: a UTC date can be a
// day behind London around midnight.

export interface LondonParts {
  weekday: number;   // 1 = Monday … 7 = Sunday (ISO)
  hour:    number;
  minute:  number;
  date:    string;   // YYYY-MM-DD in London
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function londonParts(now: Date): LondonParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return {
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    hour:    Number(get('hour')),
    minute:  Number(get('minute')),
    date:    `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export const SEND_WEEKDAY = 4;   // Thursday
export const SEND_HOUR    = 15;  // 3pm UK

/** True from 15:00 UK time on a Thursday until midnight. */
export function isSendWindow(now: Date): boolean {
  const p = londonParts(now);
  return p.weekday === SEND_WEEKDAY && p.hour >= SEND_HOUR;
}

/** Late in the afternoon, after several retries: the point at which a
 *  send that still cannot go is worth telling Tom about. */
export function isFinalAttempt(now: Date): boolean {
  const p = londonParts(now);
  return p.weekday === SEND_WEEKDAY && p.hour * 60 + p.minute >= 17 * 60 + 30;
}

/** ISO week of the London calendar date, e.g. "2026-W44". */
export function londonWeekKey(now: Date): string {
  const [y, m, d] = londonParts(now).date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The next Thursday 15:00 UK, as a display string for the admin page. */
export function nextSendLabel(now: Date): string {
  const p = londonParts(now);
  let daysAhead = (SEND_WEEKDAY - p.weekday + 7) % 7;
  if (daysAhead === 0 && p.hour >= SEND_HOUR) daysAhead = 7;
  const [y, m, d] = p.date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + daysAhead, 12));
  const label = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(target);
  return `${label}, 3:00pm UK time`;
}
