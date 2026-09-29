// Pins migration 171 (Core-OS 360 Phase 6, Group 6: Value Report
// narrative). The live database is the real check (rolled back,
// verified 2026-09-29: column exists nullable text, an ordinary
// insert with no narrative still defaults to NULL, a row with
// narrative round-trips); this stops the migration file drifting
// from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/171_value_report_narrative.sql'), 'utf8');

describe('Value report narrative (171)', () => {
  it('adds a nullable narrative column to reports, additive only', () => {
    expect(sql).toMatch(/ALTER TABLE public\.reports ADD COLUMN IF NOT EXISTS narrative TEXT;/);
    // No NOT NULL, no default, no DROP/CREATE TABLE — every existing
    // reports row and every existing writer is unaffected.
    expect(sql).not.toMatch(/narrative TEXT NOT NULL/);
    expect(sql).not.toMatch(/DROP TABLE|CREATE TABLE/);
  });
});
