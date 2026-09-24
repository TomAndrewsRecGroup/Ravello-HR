import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MILESTONE_PILLARS, MILESTONE_STATUSES, MILESTONE_PILLAR_LABELS, MILESTONE_STATUS_LABELS,
  quarterKey, quarterLabel, quarterOf, quarterOptions, quarterOrdinal,
} from '../milestones';

// Three screens used three dialects of `milestones` (admin wrote
// 'HIRE' / 'Q2 2026' / 'Not Started'; the portal read 'hire' / 'Q2-2026'
// / 'not_started'; the admin Roadmap read a `track` column that never
// existed), so no milestone could travel from admin to client. These pin
// the one shared vocabulary — and pin it against migration 087's CHECKs,
// so the code and the database cannot disagree again.

const SQL = readFileSync(
  path.resolve(__dirname, '../../../../../supabase/migrations/087_milestones_vocabulary.sql'), 'utf8');

function checkList(constraint: string): string[] {
  const m = new RegExp(`${constraint}\\s+CHECK \\(\\w+ IN \\(([^)]*)\\)\\)`).exec(SQL);
  if (!m) throw new Error(`${constraint} not found in migration 087`);
  return m[1].split(',').map(s => s.trim().replace(/'/g, ''));
}

describe('vocabulary matches the database CHECKs', () => {
  it('pillars', () => {
    expect([...MILESTONE_PILLARS].sort()).toEqual(checkList('milestones_pillar_check').sort());
  });
  it('statuses (not_started is also the column default)', () => {
    expect([...MILESTONE_STATUSES].sort()).toEqual(checkList('milestones_status_check').sort());
  });
  it('every value has a label', () => {
    for (const p of MILESTONE_PILLARS) expect(MILESTONE_PILLAR_LABELS[p]).toBeTruthy();
    for (const s of MILESTONE_STATUSES) expect(MILESTONE_STATUS_LABELS[s]).toBeTruthy();
  });
});

describe('quarters', () => {
  const QUARTER_CHECK = /^Q[1-4]-[0-9]{4}$/;   // migration 087

  it('keys use the portal format the CHECK accepts', () => {
    expect(quarterKey(2026, 3)).toBe('Q3-2026');
    expect(quarterOf(new Date('2026-09-24'))).toBe('Q3-2026');
    expect(quarterOf(new Date('2027-01-01'))).toBe('Q1-2027');
  });

  it('options roll across the year boundary, with no hardcoded year', () => {
    const opts = quarterOptions(new Date('2026-11-15'), 1, 2).map(o => o.value);
    expect(opts).toEqual(['Q3-2026', 'Q4-2026', 'Q1-2027', 'Q2-2027']);
    for (const o of opts) expect(o).toMatch(QUARTER_CHECK);
  });

  it('labels and ordering', () => {
    expect(quarterLabel('Q4-2026')).toBe('Q4 2026');
    expect(quarterOrdinal('Q1-2027')).toBeGreaterThan(quarterOrdinal('Q4-2026'));
    expect(quarterOrdinal('rubbish')).toBe(Number.MAX_SAFE_INTEGER);
  });
});
