import { describe, expect, it } from 'vitest';
import { firstDueDate, itemsToApply } from '../sectorPacks';
import type { HsSectorPackItem } from '../types';

function item(over: Partial<HsSectorPackItem> = {}): HsSectorPackItem {
  return {
    id: 'i1', pack_id: 'p1', category: 'hs_fire', title: 'Fire risk assessment',
    description: null, recurrence_every: 12, recurrence_unit: 'month', legal_basis: null,
    sort_order: 1, ...over,
  };
}

describe('itemsToApply', () => {
  it('keeps an item whose title is not already on the register', () => {
    const result = itemsToApply([item()], ['PAT testing']);
    expect(result).toHaveLength(1);
  });

  it('skips an item whose title already exists, case- and whitespace-insensitively', () => {
    const result = itemsToApply([item({ title: '  Fire Risk Assessment  ' })], ['fire risk assessment']);
    expect(result).toHaveLength(0);
  });

  it('keeps items whose titles differ from every existing register item', () => {
    const items = [item({ id: 'a', title: 'Fire risk assessment' }), item({ id: 'b', title: 'PAT testing' })];
    const result = itemsToApply(items, ['Fire risk assessment']);
    expect(result.map(i => i.id)).toEqual(['b']);
  });

  it('an empty existing-titles list keeps every pack item', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', title: 'Gas safety check' })];
    expect(itemsToApply(items, [])).toHaveLength(2);
  });
});

describe('firstDueDate', () => {
  it('a one-off item (no recurrence) is due today', () => {
    expect(firstDueDate({ recurrence_every: null, recurrence_unit: null }, '2026-09-25')).toBe('2026-09-25');
  });

  it('a monthly item is due one month from today', () => {
    expect(firstDueDate({ recurrence_every: 1, recurrence_unit: 'month' }, '2026-09-25')).toBe('2026-10-25');
  });

  it('an annual item is due one year from today', () => {
    expect(firstDueDate({ recurrence_every: 12, recurrence_unit: 'month' }, '2026-09-25')).toBe('2027-09-25');
  });

  it('a weekly item is due seven days from today', () => {
    expect(firstDueDate({ recurrence_every: 1, recurrence_unit: 'week' }, '2026-09-25')).toBe('2026-10-02');
  });

  it('a five-yearly item is due five years from today', () => {
    expect(firstDueDate({ recurrence_every: 5, recurrence_unit: 'year' }, '2026-09-25')).toBe('2031-09-25');
  });
});
