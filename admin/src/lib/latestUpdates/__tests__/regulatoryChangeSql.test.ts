import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGULATORY_CATEGORIES } from '../regulatoryChange';

// 115's CHECK is the live enforcement; REGULATORY_CATEGORIES is what the
// app may write. Either side gaining a value alone fails — the same
// discipline statusMaps.test.ts already applies to 109's CHECK.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = readFileSync(`${MIG}/115_regulatory_change_classification.sql`, 'utf8');

function listAfter(anchor: RegExp): string[] {
  const m = sql.match(anchor);
  if (!m) throw new Error(`anchor not found: ${anchor}`);
  const rest = sql.slice(m.index! + m[0].length);
  const close = rest.search(/\)\);/);
  return [...rest.slice(0, close).matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
}

describe('latest_updates.regulatory_category CHECK matches REGULATORY_CATEGORIES', () => {
  it('the CHECK list equals the tuple', () => {
    const list = listAfter(/regulatory_category IN \(/);
    expect(list.sort()).toEqual([...REGULATORY_CATEGORIES].sort());
  });

  it('the column is nullable (classification has not run yet) and the constraint allows NULL', () => {
    expect(sql).toMatch(/regulatory_category\s+TEXT/);
    expect(sql).not.toMatch(/regulatory_category\s+TEXT\s+NOT NULL/);
    expect(sql).toMatch(/CHECK \(regulatory_category IS NULL OR regulatory_category IN \(/);
  });
});
