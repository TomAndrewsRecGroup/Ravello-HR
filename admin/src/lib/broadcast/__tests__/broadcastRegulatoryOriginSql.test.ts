// Pins migration 194 (Core-OS 360 Completion Programme, Phase 25,
// Group 6: broadcast_sends.source_type/source_id, closing gap-ledger
// row C17.7). The live database is the real check (a rolled-back
// probe: a valid pair accepted, an ordinary null/null broadcast still
// accepted, a half-set pair refused, an invalid source_type refused);
// this stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/194_broadcast_regulatory_origin.sql'), 'utf8');

describe('broadcast_sends regulatory origin (194)', () => {
  it('adds source_type and source_id as nullable columns — an ordinary hand-typed broadcast is unaffected', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS source_type text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS source_id\s+uuid/);
  });

  it("source_type is restricted to exactly the two traced prefill origins, or null", () => {
    expect(sql).toMatch(/CHECK \(source_type IS NULL OR source_type IN \('legal_requirement', 'regulatory_update'\)\)/);
  });

  it('source_type and source_id must be set together — never a half pair', () => {
    expect(sql).toMatch(/CHECK \(\(source_type IS NULL\) = \(source_id IS NULL\)\)/);
  });
});
