// Pins migration 161 (Core-OS 360 Phase 5, Group 6: Objectives &
// Targets, and Management Review). The live database is the real check
// (supabase/probes/161_objectives_management_review.sql, 21/21 PASS);
// this stops the migration file drifting from what was applied and
// pins the properties that, if lost, would let an objective's status
// be decided by something other than a deterministic measurement
// comparison, or let a completed review's decisions be edited.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/161_objectives_management_review.sql'), 'utf8');

const NEW_TABLES = [
  'objectives', 'objective_measurements', 'management_reviews',
  'management_review_attendees', 'management_review_data_pack', 'management_review_decisions',
];
const CLIENT_READABLE = [
  'objectives', 'objective_measurements', 'management_reviews',
  'management_review_attendees', 'management_review_decisions',
];
const STAFF_ONLY = ['management_review_data_pack'];

describe('Objectives & Targets, and Management Review (161)', () => {
  it('RLS is enabled on all six new tables', () => {
    for (const t of NEW_TABLES) {
      expect(sql, t).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  it('every table has a staff ALL policy, and no policy is USING (true) or granted to anon', () => {
    for (const t of NEW_TABLES) {
      expect(sql, t).toMatch(new RegExp(`CREATE POLICY ${t}_staff_all ON public\\.${t} FOR ALL TO authenticated[\\s\\S]*?is_tps_staff\\(\\)`));
    }
    expect(sql).not.toMatch(/USING \(true\)/);
    expect(sql).not.toMatch(/TO anon/);
  });

  it('management_review_data_pack is staff-only — no client SELECT/write policy at all', () => {
    for (const t of STAFF_ONLY) {
      expect(sql, t).not.toMatch(new RegExp(`CREATE POLICY ${t}_read`));
      expect(sql, t).not.toMatch(new RegExp(`CREATE POLICY ${t}_(insert|update|delete)`));
    }
  });

  it('every other table is client-READ + staff-MANAGE only — no client write path', () => {
    for (const t of CLIENT_READABLE) {
      expect(sql, t).toMatch(new RegExp(`CREATE POLICY ${t}_read ON public\\.${t} FOR SELECT TO authenticated\\s+USING \\(company_id = \\(SELECT public\\.my_company_id\\(\\)\\)`));
      expect(sql, t).not.toMatch(new RegExp(`CREATE POLICY ${t}_(insert|update|delete)`));
    }
  });

  it('every client-readable table calls apply_write_guard(), the staff-only data pack does not', () => {
    for (const t of CLIENT_READABLE) {
      expect(sql, t).toMatch(new RegExp(`apply_write_guard\\('public\\.${t}'\\)`));
    }
    for (const t of STAFF_ONLY) {
      expect(sql, t).not.toMatch(new RegExp(`apply_write_guard\\('public\\.${t}'\\)`));
    }
  });

  it('objective_measurements is insert-only — no UPDATE/DELETE/TRUNCATE grant to any session', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.objective_measurements FROM PUBLIC, anon, authenticated/);
  });

  it('management_review_data_pack is insert-only — a snapshot is never edited', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.management_review_data_pack FROM PUBLIC, anon, authenticated/);
  });

  it('management_review_decisions is insert-only — a correction is a new row, never an edit', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.management_review_decisions FROM PUBLIC, anon, authenticated/);
  });

  it('rule 2: the roll is a DETERMINISTIC comparison against target_value/target_direction, never an AI call', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.objective_measurements_roll'), sql.indexOf('$$;', sql.indexOf('FUNCTION public.objective_measurements_roll')));
    expect(fn).toMatch(/CASE o\.target_direction/);
    expect(fn).toMatch(/WHEN 'decrease' THEN NEW\.value <= o\.target_value/);
    expect(fn).toMatch(/ELSE NEW\.value >= o\.target_value/);
    expect(fn).not.toMatch(/fetch\(|http:\/\/|https:\/\/|jev|Jev|JEV/);
  });

  it('rule 2: the roll never overrides a human "abandoned" decision, and skips when target_value is null', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.objective_measurements_roll'), sql.indexOf('$$;', sql.indexOf('FUNCTION public.objective_measurements_roll')));
    expect(fn).toMatch(/o\.status = 'abandoned' OR o\.target_value IS NULL/);
  });

  it('rule 2: the roll only advances from the NEWEST measurement (the 148a/PUWER lesson)', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.objective_measurements_roll'), sql.indexOf('$$;', sql.indexOf('FUNCTION public.objective_measurements_roll')));
    expect(fn).toMatch(/NOT EXISTS|EXISTS/);
    expect(fn).toMatch(/m2\.measured_at > NEW\.measured_at/);
  });

  it('company_id on objective_measurements is derived from the objective, never trusted from the caller', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.objective_measurements_fill'), sql.indexOf('$$;', sql.indexOf('FUNCTION public.objective_measurements_fill')));
    expect(fn).toMatch(/SELECT company_id INTO o FROM public\.objectives WHERE id = NEW\.objective_id/);
    expect(fn).toMatch(/NEW\.company_id := o\.company_id/);
  });

  it('rule 3: a decision insert is refused once the parent review is completed', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.management_review_decisions_guard'), sql.indexOf('$$;', sql.indexOf('FUNCTION public.management_review_decisions_guard')));
    expect(fn).toMatch(/r\.status = 'completed'/);
    expect(fn).toMatch(/RAISE EXCEPTION/);
  });

  it('rule 1: actions.source_type gains exactly two new values, objective and management_review', () => {
    expect(sql).toMatch(/ALTER TABLE public\.actions ADD CONSTRAINT actions_source_type_check CHECK/);
    expect(sql).toMatch(/'objective', 'management_review'/);
  });

  it('no SECURITY DEFINER function this migration adds is executable by anon or authenticated', () => {
    for (const fn of [
      'objectives_stamp', 'objective_measurements_fill', 'objective_measurements_roll',
      'management_reviews_stamp', 'management_review_attendees_fill',
      'management_review_data_pack_fill', 'management_review_decisions_guard',
    ]) {
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('the outbox never whitelists free text — description/decision_text/notes', () => {
    const FORBIDDEN = /^(description|decision_text|notes)$/;
    const triggers = [...sql.matchAll(/EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/g)];
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    for (const t of triggers) {
      const cols = [...t[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
      for (const c of cols) expect(c, t[1]).not.toMatch(FORBIDDEN);
    }
  });

  it('audit_row never whitelists free text', () => {
    const FORBIDDEN = /^(description|decision_text|notes|data)$/;
    const triggers = [...sql.matchAll(/EXECUTE FUNCTION public\.audit_row\(([^)]*)\)/g)];
    expect(triggers.length).toBeGreaterThanOrEqual(4);
    for (const t of triggers) {
      const cols = [...t[1].matchAll(/'([^']+)'/g)].map(x => x[1]).slice(2);
      for (const c of cols) expect(c, t[1]).not.toMatch(FORBIDDEN);
    }
  });

  it('carries no AI/model-judgement language anywhere in this file', () => {
    const withoutComments = sql.replace(/--.*$/gm, '');
    expect(withoutComments.toLowerCase()).not.toMatch(/\bjev\b|openai|anthropic|gpt/);
  });

  it('same-organisation checks guard owner_person_id and chaired_by', () => {
    expect(sql).toMatch(/assert_same_org\(NEW\.company_id, 'people', NEW\.owner_person_id\)/);
    expect(sql).toMatch(/assert_same_org\(NEW\.company_id, 'people', NEW\.chaired_by\)/);
  });
});
