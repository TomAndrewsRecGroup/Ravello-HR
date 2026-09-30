// Pins migration 193 (Core-OS 360 Completion Programme, Phase 25,
// Group 5: notification_preferences.what_changed_digest, closing
// gap-ledger row C9.5). The live database is the real check (a
// rolled-back probe: a valid value is accepted, an invalid one is
// refused by the CHECK, the column default is 'off'); this stops the
// migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WHAT_CHANGED_DIGEST_MODES } from '../types';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/193_what_changed_digest_preference.sql'), 'utf8');

describe('notification_preferences.what_changed_digest (193)', () => {
  it('adds the column NOT NULL, DEFAULT off — explicit opt-in, never a surprise new email', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS what_changed_digest text NOT NULL DEFAULT 'off'/);
  });

  it("the CHECK's value list matches WHAT_CHANGED_DIGEST_MODES exactly, both ways", () => {
    const match = sql.match(/CHECK \(what_changed_digest IN \(([^)]+)\)\)/);
    expect(match).not.toBeNull();
    const values = match![1].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
    expect(values.sort()).toEqual([...WHAT_CHANGED_DIGEST_MODES].sort());
  });
});
