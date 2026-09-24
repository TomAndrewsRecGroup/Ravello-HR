import { describe, expect, it } from 'vitest';
import { daysUntil, nextDue, ragFor } from '../recurrence';

// Every expected value here was produced by the LIVE SQL hs_next_due()
// (migration 095) on 2026-09-24 — the function that actually rolls the
// register forward. This file keeps the form's "next due" preview from
// disagreeing with what the database will store.
const FROM_POSTGRES: [string, number, 'day' | 'week' | 'month' | 'year', string][] = [
  ['2026-01-31', 1,  'month', '2026-02-28'],
  ['2024-01-31', 1,  'month', '2024-02-29'],
  ['2026-08-31', 6,  'month', '2027-02-28'],
  ['2024-02-29', 1,  'year',  '2025-02-28'],
  ['2026-09-24', 14, 'month', '2027-11-24'],   // LEV: every 14 months
  ['2026-09-24', 7,  'day',   '2026-10-01'],   // scaffold: every 7 days
  ['2026-12-28', 1,  'week',  '2027-01-04'],
  ['2026-03-31', 3,  'month', '2026-06-30'],
  ['2026-11-30', 3,  'month', '2027-02-28'],
  ['2026-09-24', 5,  'year',  '2031-09-24'],
  ['2026-10-25', 1,  'day',   '2026-10-26'],   // UK clocks change that night
];

describe('nextDue mirrors SQL hs_next_due', () => {
  it.each(FROM_POSTGRES)('%s + %i %s = %s', (from, every, unit, want) => {
    expect(nextDue(from, every, unit)).toBe(want);
  });

  it('a one-off item has no next due date', () => {
    expect(nextDue('2026-09-24', null, null)).toBeNull();
  });
});

describe('ragFor', () => {
  const today = '2026-09-24';
  it('due today is amber, not red', () => expect(ragFor('pending', '2026-09-24', today)).toBe('amber'));
  it('yesterday is red', () => expect(ragFor('pending', '2026-09-23', today)).toBe('red'));
  it('30 days out is amber, 31 green', () => {
    expect(ragFor('pending', '2026-10-24', today)).toBe('amber');
    expect(ragFor('pending', '2026-10-25', today)).toBe('green');
  });
  it('complete wins over any date', () => expect(ragFor('complete', '2020-01-01', today)).toBe('complete'));
  it('daysUntil counts calendar days', () => expect(daysUntil('2026-10-01', today)).toBe(7));
});
