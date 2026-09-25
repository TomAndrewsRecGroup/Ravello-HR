import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Support page selected `type` and `message` from service_requests,
// two columns it never had, so the client's request list failed on
// every load. The select is checked against the migration that
// defines the table.

const page = readFileSync(resolve(__dirname, '../page.tsx'), 'utf8');
const sql = readFileSync(resolve(__dirname, '../../../../../../supabase/migrations/002_friction_score_and_new_tables.sql'), 'utf8');
const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS service_requests'), sql.indexOf(');', sql.indexOf('CREATE TABLE IF NOT EXISTS service_requests')));
const columns = new Set([...table.matchAll(/^\s+(\w+)\s+(UUID|TEXT|JSONB|TIMESTAMPTZ)\b/gm)].map(m => m[1]));

describe('portal support page', () => {
  it('selects only columns service_requests has', () => {
    const m = /from\('service_requests'\)\s*\.select\('([^']+)'\)/.exec(page);
    expect(m, 'service_requests select not found').toBeTruthy();
    const selected = m![1].split(',').map(s => s.trim());
    expect(columns.size).toBeGreaterThan(8);
    for (const c of selected) expect(columns.has(c), `selects ${c}`).toBe(true);
  });
  it('does not read the phantom columns anywhere', () => {
    expect(page).not.toMatch(/\br\.type\b/);
    expect(page).not.toMatch(/\br\.message\b/);
  });
});
