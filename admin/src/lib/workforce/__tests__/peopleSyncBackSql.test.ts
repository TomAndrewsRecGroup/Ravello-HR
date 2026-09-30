// Pins migration 184 (Core-OS 360 Completion Programme, Phase 21,
// closing C1.10 — "people synced back from source rows"). Phase 1's own
// handover (§H) recorded that person_link_row() (118) only ever links
// or creates a people row ONCE, at INSERT time, and never syncs an
// edit made afterward. This asserts the fix: a real AFTER UPDATE
// trigger on each of the three identity tables, never a SECURITY
// INVOKER function (a session must not be able to write `people`
// directly through this path), never granted to anon/authenticated,
// and never raising — an edit to a candidate/athlete/employee record
// must succeed even if the people-row update fails for some reason.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/184_people_sync_back.sql'), 'utf8');

describe('person_sync_from_source (184)', () => {
  it('is SECURITY DEFINER and revoked from every session role', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.person_sync_from_source\(\)[\s\S]*?SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.person_sync_from_source\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('AFTER UPDATE triggers exist on all three identity tables, on the right columns', () => {
    expect(sql).toMatch(/CREATE TRIGGER candidates_person_sync\s+AFTER UPDATE OF full_name, email, phone ON public\.candidates/);
    expect(sql).toMatch(/CREATE TRIGGER athletes_person_sync\s+AFTER UPDATE OF full_name, email ON public\.athletes/);
    expect(sql).toMatch(
      /CREATE TRIGGER employee_records_person_sync\s+AFTER UPDATE OF full_name, email, phone, job_title, employee_number, department_id, site_id ON public\.employee_records/,
    );
  });

  it('never raises out of the sync itself — the source edit must always succeed', () => {
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'person_sync_from_source\(%\): %', TG_TABLE_NAME, SQLERRM/);
  });

  it('is a no-op when the source row has no person_id', () => {
    expect(sql).toMatch(/IF NEW\.person_id IS NULL THEN RETURN NULL; END IF;/);
  });

  it('full_name/email always overwrite; the remaining fields only fill a gap (COALESCE)', () => {
    // full_name is a direct assignment (never COALESCE) on all three branches.
    const fullNameAssignments = [...sql.matchAll(/full_name\s*=\s*(NEW\.full_name|COALESCE\(NEW\.full_name[^)]*\))/g)];
    expect(fullNameAssignments.length).toBeGreaterThanOrEqual(3);
    for (const m of fullNameAssignments) expect(m[1]).toBe('NEW.full_name');

    // job_title/employee_number/department_id/site_id/phone preserve an
    // existing people value rather than being blanked by a null edit —
    // the same COALESCE discipline person_link_row() already uses at
    // INSERT time (`job_title = COALESCE(NEW.job_title, job_title)`).
    for (const col of ['phone', 'job_title', 'employee_number', 'department_id', 'site_id']) {
      expect(sql).toMatch(new RegExp(`${col}\\s*=\\s*COALESCE\\(NEW\\.${col}, ${col}\\)`));
    }
  });

  it('the migration never touches employee_records.status (that stays person_employee_status()’s own job, 118)', () => {
    expect(sql).not.toMatch(/worker_type\s*=\s*CASE/);
    expect(sql).not.toMatch(/employment_status\s*=/);
  });
});
