// Pins migration 165 (Core-OS 360 Phase 5, Group 10 QA fix). The live
// database is the real check (supabase/probes/165_emergency_plan_supersede_race.sql,
// 5/5 PASS); this stops the migration file drifting from what was
// applied and pins the property that, if lost, would silently let a
// new emergency plan version land as 'active' alongside its own
// parent forever — emergency_plans had NO automated supersede at all
// before this fix (unlike hs_documents, which at least had a buggy one
// until 164). Reproduced live BEFORE this fix (see the migration's own
// header comment).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/165_emergency_plan_supersede_race_fix.sql'), 'utf8');

describe('emergency_plans supersede-race fix (165)', () => {
  it('supersedes the named parent AND any sibling row racing for the same parent slot', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.emergency_plans_supersede_roll'), sql.indexOf('REVOKE ALL ON FUNCTION public.emergency_plans_supersede_roll'));
    // The named-parent supersession.
    expect(fn).toMatch(/WHERE id = NEW\.supersedes_id\s*\n\s*AND status = 'active'/);
    // The sibling-race supersession: same supersedes_id, a different
    // row, currently active.
    expect(fn).toMatch(/WHERE supersedes_id = NEW\.supersedes_id\s*\n\s*AND id <> NEW\.id\s*\n\s*AND status = 'active'/);
  });

  it('fires on INSERT, since a new version is always a new row here, never an UPDATE reactivating an old one', () => {
    expect(sql).toMatch(/CREATE TRIGGER emergency_plans_supersede_roll\s*\nAFTER INSERT ON public\.emergency_plans/);
  });

  it('the DEFINER function is revoked from anon and authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.emergency_plans_supersede_roll\(\) FROM PUBLIC, anon, authenticated/);
  });
});
