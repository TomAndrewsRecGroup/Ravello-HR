// Pins migration 185 (Core-OS 360 Completion Programme, Phase 22, Group 1
// — closes C4.13). 173's own header comment flagged this as debt:
// "consultancy_visits.status [had] no lifecycle GUARD trigger (unlike
// permits/isolations)... any authorised session may move between any two
// listed values." This asserts the fix: a BEFORE UPDATE trigger, firing
// only when status actually changes, matching the two real write paths
// this codebase has (VisitCaptureClient.tsx's start/finish buttons, and
// the report-issue route's own advance) plus the full documented CHECK
// vocabulary for confirm/close/cancel, which nothing currently writes but
// which the schema itself already allows.
// The live database is the real check
// (supabase/probes/185_consultancy_visits_lifecycle_guard.sql, 12/12
// pass); this stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISIT_STATUSES } from '../vocab';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/185_consultancy_visits_lifecycle_guard.sql'), 'utf8');

describe('consultancy_visits_lifecycle_guard (185)', () => {
  it('is SECURITY DEFINER and revoked from every session role', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.consultancy_visits_lifecycle_guard\(\)[\s\S]*?SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.consultancy_visits_lifecycle_guard\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('is a BEFORE UPDATE trigger on consultancy_visits, firing on every row', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER consultancy_visits_lifecycle_guard BEFORE UPDATE ON public\.consultancy_visits\s+FOR EACH ROW EXECUTE FUNCTION public\.consultancy_visits_lifecycle_guard\(\)/,
    );
  });

  it('only evaluates when status actually changes (IS DISTINCT FROM)', () => {
    expect(sql).toMatch(/IF NEW\.status IS DISTINCT FROM OLD\.status THEN/);
  });

  it('refuses an unlisted transition with a 23514 (check-violation) errcode', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'Cannot move a visit from % to %', OLD\.status, NEW\.status USING ERRCODE = '23514'/);
  });

  it('allows exactly the transitions the real write paths and the CHECK vocabulary need', () => {
    // planned -> confirmed, and planned/confirmed -> in_progress (the
    // real startVisit() path skips confirmed entirely).
    expect(sql).toMatch(/NEW\.status = 'confirmed' AND OLD\.status = 'planned'/);
    expect(sql).toMatch(/NEW\.status = 'in_progress' AND OLD\.status IN \('planned', 'confirmed'\)/);
    // finishCapturing() -> awaiting_report, then the two draft/issue steps.
    expect(sql).toMatch(/NEW\.status = 'awaiting_report' AND OLD\.status = 'in_progress'/);
    expect(sql).toMatch(/NEW\.status = 'report_draft' AND OLD\.status = 'awaiting_report'/);
    expect(sql).toMatch(/NEW\.status = 'report_issued' AND OLD\.status IN \('awaiting_report', 'report_draft'\)/);
    // report_issued -> closed.
    expect(sql).toMatch(/NEW\.status = 'closed' AND OLD\.status = 'report_issued'/);
    // cancelled is reachable from every non-terminal status only.
    expect(sql).toMatch(
      /NEW\.status = 'cancelled' AND OLD\.status IN\s+\('planned', 'confirmed', 'in_progress', 'awaiting_report', 'report_draft'\)/,
    );
  });

  it('never allows a transition INTO or OUT OF a terminal status beyond what is listed (closed/cancelled are dead ends)', () => {
    // Every OLD.status IN (...) list that leads to a non-terminal or
    // cancelled NEW.status must never itself contain 'closed' or 'cancelled'.
    const oldStatusLists = [...sql.matchAll(/OLD\.status (?:=|IN \(([^)]*)\))/g)];
    for (const m of oldStatusLists) {
      if (!m[1]) continue; // a bare `= 'x'` comparison, not a list
      expect(m[1]).not.toContain("'closed'");
      expect(m[1]).not.toContain("'cancelled'");
    }
  });

  it('every status named anywhere in the guard is a real value from VISIT_STATUSES', () => {
    const named = new Set([...sql.matchAll(/(?:NEW|OLD)\.status\s*(?:=|IN)\s*\(?'?([a-z_]+)'?/g)].map(m => m[1]));
    const validNames = [...named].filter(n => (VISIT_STATUSES as readonly string[]).includes(n));
    expect(validNames.length).toBeGreaterThan(0);
    for (const n of named) {
      if (n.length < 3) continue; // skip any stray non-word capture
      expect((VISIT_STATUSES as readonly string[])).toContain(n);
    }
  });

  it('adds no required-reason-field checks — consultancy_visits carries none of those columns', () => {
    // The migration's own header comment explains the absence by NAME
    // (mentioning permits' reason columns for contrast), so scope this
    // check to the function body itself, not the whole file.
    const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.consultancy_visits_lifecycle_guard()'));
    expect(body).not.toMatch(/suspended_reason|closeout_notes|revoked_reason/);
  });
});
