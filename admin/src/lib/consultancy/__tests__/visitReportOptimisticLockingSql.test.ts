// Pins migration 190 (Core-OS 360 Completion Programme, Phase 24,
// Group 1 — the Phase-24 slice of gap-ledger row C1.12, "optimistic
// locking on shared records"). Checked live before writing this
// migration: `consultancy_service_scopes` has no update writer
// anywhere (insert-only), and `consultancy_visits`' status transitions
// are already protected by their own lifecycle guard (185) — neither
// needed a row_version. The one genuine gap was
// `consultancy_visit_reports`' free-text draft save, which had no
// conflict detection at all.
// The live database is the real check
// (supabase/probes/190_visit_report_optimistic_locking.sql, 6/6
// pass); this stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/190_visit_report_optimistic_locking.sql'), 'utf8');

describe('consultancy_visit_reports row_version (190)', () => {
  it('adds row_version as a NOT NULL integer defaulting to 1', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1/);
  });

  it('the INSERT-time trigger (fill) forces row_version to 1, ignoring anything the caller sent', () => {
    const fillFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.consultancy_visit_report_fill()'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.consultancy_visit_report_touch()'),
    );
    expect(fillFn).toMatch(/NEW\.row_version := 1;/);
  });

  it('the UPDATE-time trigger (touch) always advances OLD.row_version + 1, never trusts a caller-sent value', () => {
    const touchFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.consultancy_visit_report_touch()'));
    expect(touchFn).toMatch(/NEW\.row_version := OLD\.row_version \+ 1;/);
    // The overwrite must be unconditional — no `IF NEW.row_version ...`
    // branch that would let a caller-sent value survive under any
    // condition.
    expect(touchFn).not.toMatch(/IF\s+NEW\.row_version/);
  });

  it('the touch trigger still refuses visit_id/organisation/supersedes_id changes (176 behaviour preserved)', () => {
    const touchFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.consultancy_visit_report_touch()'));
    expect(touchFn).toMatch(/visit_id\/organisation\/supersedes_id cannot be changed after creation/);
    expect(touchFn).toMatch(/USING ERRCODE = '42501'/);
  });

  it('both trigger functions are SECURITY DEFINER and revoked from every session role', () => {
    for (const fn of ['consultancy_visit_report_fill', 'consultancy_visit_report_touch']) {
      expect(sql).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?SECURITY DEFINER`));
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('touches no other table — consultancy_service_scopes/consultancy_visits are deliberately unchanged', () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.consultancy_service_scopes/);
    expect(sql).not.toMatch(/ALTER TABLE public\.consultancy_visits\b/);
  });

  it('does not re-create the triggers — only CREATE OR REPLACE FUNCTION, since neither event/timing changed', () => {
    expect(sql).not.toMatch(/CREATE TRIGGER consultancy_visit_report_fill/);
    expect(sql).not.toMatch(/CREATE TRIGGER consultancy_visit_report_touch/);
  });
});
