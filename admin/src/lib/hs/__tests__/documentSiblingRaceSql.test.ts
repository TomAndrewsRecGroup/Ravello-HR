// Pins migration 164 (Core-OS 360 Phase 5, Group 10 QA fix). The live
// database is the real check (supabase/probes/164_document_sibling_race.sql,
// 4/4 PASS); this stops the migration file drifting from what was
// applied and pins the property that, if lost, would silently let two
// sibling document versions both read 'active' at once — reproduced
// live BEFORE this fix (see the migration's own header comment).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/164_document_sibling_race_fix.sql'), 'utf8');

describe('hs_documents sibling-race fix (164)', () => {
  it('supersedes the named parent AND any sibling row racing for the same parent slot', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.hs_document_supersede_roll'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_document_supersede_roll'));
    // The named-parent supersession (unchanged from 160).
    expect(fn).toMatch(/WHERE id = NEW\.supersedes_id\s*\n\s*AND status IN \('active', 'review_due', 'approved'\)/);
    // The NEW sibling-race supersession: same supersedes_id, a
    // different row, currently active.
    expect(fn).toMatch(/WHERE supersedes_id = NEW\.supersedes_id\s*\n\s*AND id <> NEW\.id\s*\n\s*AND status = 'active'/);
  });

  it('only fires on a genuine transition INTO active, never on every update', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.hs_document_supersede_roll'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_document_supersede_roll'));
    expect(fn).toMatch(/IF NEW\.status = 'active' AND OLD\.status IS DISTINCT FROM 'active' THEN/);
  });

  it('the DEFINER function is revoked from anon and authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.hs_document_supersede_roll\(\) FROM PUBLIC, anon, authenticated/);
  });
});
