import type { HsSectorPackItem } from './types';

// Pure helper for "Apply sector pack" (RegisterClient / ApplyPackPanel).
// Kept out of the component so the dedup rule is unit-testable without a
// browser or a live Supabase client — the same discipline lib/support/sla.ts
// and lib/hiring/employeeFromHire.ts already follow.
//
// A pack item is skipped when a register item with the SAME TITLE already
// exists on the company's register (case-insensitive, trimmed) — titles are
// the only thing a pack item and a register item share, and this is a
// best-effort de-dup for a staff-only bulk-add, not a hard database
// guarantee (compliance_items has no unique constraint on title).
export function itemsToApply(
  packItems: HsSectorPackItem[],
  existingTitles: readonly string[],
): HsSectorPackItem[] {
  const existing = new Set(existingTitles.map(t => t.trim().toLowerCase()));
  return packItems.filter(i => !existing.has(i.title.trim().toLowerCase()));
}

/** The register item's first due date for a freshly-applied pack item:
 *  a recurring item is next due after one full cycle from today (it has
 *  never been done, so "next due" is the first occurrence); a one-off
 *  item is due today, since nothing else would ever schedule it. */
export function firstDueDate(
  item: Pick<HsSectorPackItem, 'recurrence_every' | 'recurrence_unit'>,
  today: string,
): string {
  if (item.recurrence_every == null || item.recurrence_unit == null) return today;
  const d = new Date(`${today}T00:00:00Z`);
  switch (item.recurrence_unit) {
    case 'day':   d.setUTCDate(d.getUTCDate() + item.recurrence_every); break;
    case 'week':  d.setUTCDate(d.getUTCDate() + item.recurrence_every * 7); break;
    case 'month': d.setUTCMonth(d.getUTCMonth() + item.recurrence_every); break;
    case 'year':  d.setUTCFullYear(d.getUTCFullYear() + item.recurrence_every); break;
  }
  return d.toISOString().slice(0, 10);
}
