// Pins migration 173 (Core-OS 360 Phase 7, Group 1: the visit entity
// and visit templates). The live database is the real check
// (supabase/probes/173_consultant_visit_workflow.sql, 7/7 pass); this
// stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISIT_STATUSES, VISIT_TEMPLATE_CATEGORIES } from '../vocab';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/173_consultant_visit_workflow.sql'), 'utf8');

function checkList(source: string, column: string): string[] {
  const re = new RegExp(`${column}\\s+text[^\\n]*CHECK \\([^)]*IN \\(([^)]*)\\)`);
  const m = source.match(re);
  expect(m, `${column} CHECK not found`).toBeTruthy();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
}

describe('Consultant visit workflow (173)', () => {
  it('the status CHECK matches VISIT_STATUSES exactly', () => {
    const re = /ADD CONSTRAINT consultancy_visits_status_check\s+CHECK \(status IN \(([^)]*)\)\)/;
    const values = [...sql.match(re)![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    expect(values.sort()).toEqual([...VISIT_STATUSES].sort());
  });

  it('consultancy_visit_templates.category matches VISIT_TEMPLATE_CATEGORIES exactly', () => {
    const templatesTable = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.consultancy_visit_templates'));
    expect(checkList(templatesTable, 'category').sort()).toEqual([...VISIT_TEMPLATE_CATEGORIES].sort());
  });

  it('previous_visit_id is guarded by a same-client trigger, never a bare FK alone', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.consultancy_visit_previous_guard\(\)/);
    expect(sql).toMatch(/must reference a visit for the SAME client/);
    expect(sql).toMatch(/CREATE TRIGGER consultancy_visit_previous_guard BEFORE INSERT OR UPDATE ON public\.consultancy_visits/);
  });

  it('the previous-visit guard is not executable by anon or authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.consultancy_visit_previous_guard\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('templates and items are portfolio-wide (my_home_company_id, not my_company_id), gated on consultancy.service_manage', () => {
    expect(sql).toMatch(/consultancy_organisation_id = \(SELECT public\.my_home_company_id\(\)\)/);
    expect(sql).not.toMatch(/consultancy_organisation_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(sql).toMatch(/'consultancy\.service_manage'/);
  });

  it('never whitelists free text (internal_notes, shared_summary, scope) in the audit trail', () => {
    const start = sql.lastIndexOf('CREATE TRIGGER consultancy_visits_audit');
    const body = sql.slice(start, sql.indexOf(');', start));
    for (const forbidden of ['internal_notes', 'shared_summary', "'scope'"]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  it('calls apply_write_guard() on both new tables', () => {
    expect(sql).toMatch(/apply_write_guard\('public\.consultancy_visit_templates'\)/);
    expect(sql).toMatch(/apply_write_guard\('public\.consultancy_visit_template_items'\)/);
  });

  it('is additive to consultancy_visits — ADD COLUMN IF NOT EXISTS, never a rewrite', () => {
    expect(sql).toMatch(/ALTER TABLE public\.consultancy_visits\s*\n\s*ADD COLUMN IF NOT EXISTS previous_visit_id/);
    expect(sql).not.toMatch(/DROP TABLE public\.consultancy_visits/);
  });
});
