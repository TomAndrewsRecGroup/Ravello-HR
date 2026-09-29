// Pins migration 166 (Core-OS 360 Phase 5, Group 10 QA fix). The live
// database is the real check (supabase/probes/166_environmental_aspect_supersede_race.sql,
// 3/3 PASS); this stops the migration file drifting from what was
// applied. Same defect class as 165 (emergency_plans): a material
// change is meant to be a new row with the old one flipped to
// 'superseded' (156's own comment), but nothing enforced that until
// this fix — reproduced live BEFORE this fix (see the migration's own
// header comment). Defensive: no current admin UI path sets
// supersedes_id for this table yet.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/166_environmental_aspect_supersede_race_fix.sql'), 'utf8');

describe('environmental_aspects supersede-race fix (166)', () => {
  it('supersedes the named parent AND any sibling row racing for the same parent slot', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.environmental_aspects_supersede_roll'), sql.indexOf('REVOKE ALL ON FUNCTION public.environmental_aspects_supersede_roll'));
    expect(fn).toMatch(/WHERE id = NEW\.supersedes_id\s*\n\s*AND status <> 'superseded'/);
    expect(fn).toMatch(/WHERE supersedes_id = NEW\.supersedes_id\s*\n\s*AND id <> NEW\.id\s*\n\s*AND status <> 'superseded'/);
  });

  it('fires on INSERT, never touching a row that is already superseded', () => {
    expect(sql).toMatch(/CREATE TRIGGER environmental_aspects_supersede_roll\s*\nAFTER INSERT ON public\.environmental_aspects/);
  });

  it('the DEFINER function is revoked from anon and authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.environmental_aspects_supersede_roll\(\) FROM PUBLIC, anon, authenticated/);
  });
});
