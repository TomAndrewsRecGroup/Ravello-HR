// Pins migration 174 (Core-OS 360 Phase 7, Group 3: structured visit
// observations + the evidence policies for mobile/tablet capture). The
// live database is the real check
// (supabase/probes/174_visit_observations_mobile_capture.sql, 11/11
// pass); this stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OBSERVATION_SEVERITIES, OBSERVATION_TYPES } from '../vocab';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/174_visit_observations_mobile_capture.sql'), 'utf8');

function checkList(source: string, column: string): string[] {
  const re = new RegExp(`${column}\\s+text[^\\n]*CHECK \\([^)]*IN \\(([^)]*)\\)`);
  const m = source.match(re);
  expect(m, `${column} CHECK not found`).toBeTruthy();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
}

describe('Visit observations (174)', () => {
  it('observation_type matches OBSERVATION_TYPES exactly', () => {
    expect(checkList(sql, 'observation_type').sort()).toEqual([...OBSERVATION_TYPES].sort());
  });

  it('severity matches OBSERVATION_SEVERITIES exactly', () => {
    const re = /severity\s+text CHECK \(severity IS NULL OR severity IN \(([^)]*)\)\)/;
    const m = sql.match(re);
    expect(m, 'severity CHECK not found').toBeTruthy();
    const values = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    expect(values.sort()).toEqual([...OBSERVATION_SEVERITIES].sort());
  });

  it('company_id is derived from the visit by trigger, never a bare column the caller can set', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.visit_observation_fill\(\)/);
    expect(sql).toMatch(/NEW\.company_id := v_client;/);
    expect(sql).toMatch(/CREATE TRIGGER visit_observation_fill BEFORE INSERT ON public\.visit_observations/);
  });

  it('a linked source must belong to the same client as the visit — the QA command\'s own named attack', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.visit_observation_fill'), sql.indexOf('REVOKE ALL ON FUNCTION public.visit_observation_fill'));
    expect(body).toMatch(/hs_entity_company\(NEW\.linked_source_type, NEW\.linked_source_id\)/);
    expect(body).toMatch(/linked_company IS DISTINCT FROM v_client/);
    expect(body).toMatch(/ERRCODE = '42501'/);
  });

  it('immediate_danger escalates synchronously, regardless of action_required, never gated on it', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.visit_observation_escalate'), sql.indexOf('REVOKE ALL ON FUNCTION public.visit_observation_escalate'));
    expect(body).toMatch(/IF NEW\.observation_type = 'immediate_danger' THEN/);
    expect(body).not.toMatch(/action_required/);
    expect(body).toMatch(/'urgent', 'active'/);
    expect(body).toMatch(/'critical', true, false/);
    expect(body).toMatch(/UPDATE public\.visit_observations SET resulting_action_id = new_action_id/);
  });

  it('both trigger functions are not directly executable by anon or authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.visit_observation_fill\(\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.visit_observation_escalate\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('RLS is portfolio-wide (my_home_company_id, never my_company_id) for the consultancy policy, keyed on the VISIT\'s own client', () => {
    const start = sql.indexOf('CREATE POLICY visit_observations_consultancy_all');
    const body = sql.slice(start, sql.indexOf(';', start) + 1);
    expect(body).toMatch(/v\.consultancy_organisation_id = \(SELECT public\.my_home_company_id\(\)\)/);
    expect(body).toMatch(/'consultancy\.service_manage'/);
    expect(body).not.toMatch(/my_company_id\(\)/);
  });

  it('the client read policy only shows client_visible rows for the client\'s own company', () => {
    const start = sql.indexOf('CREATE POLICY visit_observations_client_read');
    const body = sql.slice(start, sql.indexOf(';', start) + 1);
    expect(body).toMatch(/company_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(body).toMatch(/client_visible = true/);
  });

  it('never whitelists free-text description in the audit trail', () => {
    const start = sql.lastIndexOf('CREATE TRIGGER visit_observations_audit');
    const body = sql.slice(start, sql.indexOf(');', start));
    expect(body).not.toContain('description');
    expect(body).not.toContain('location_section');
  });

  it('the outbox whitelist never carries free-text description', () => {
    const start = sql.lastIndexOf('CREATE TRIGGER visit_observations_platform_event');
    const body = sql.slice(start, sql.indexOf(');', start));
    expect(body).not.toContain('description');
  });

  it('calls apply_write_guard() on visit_observations', () => {
    expect(sql).toMatch(/apply_write_guard\('public\.visit_observations'\)/);
  });

  it('gains a hs_scope_for_entity / hs_entity_table branch for visit_observation, additive to every prior branch', () => {
    expect(sql).toMatch(/WHEN 'visit_observation'\s+THEN 'register'/);
    expect(sql).toMatch(/WHEN 'visit_observation'\s+THEN 'visit_observations'/);
    // spot-check a handful of pre-existing branches survive unchanged —
    // this migration is additive, never a rewrite that could drop one.
    for (const [type, scope] of [["'register_item'", "'register'"], ["'document'", "'documents'"], ["'audit'", "'audits'"], ["'incident'", "'incidents'"]]) {
      expect(sql).toMatch(new RegExp(`WHEN ${type}\\s+THEN ${scope}`));
    }
  });

  it('two new hs_files policies are scoped to visit_observation only, never widening hs_files_client_read/insert', () => {
    expect(sql).toMatch(/CREATE POLICY hs_files_consultancy_visit_read ON public\.hs_files FOR SELECT TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY hs_files_consultancy_visit_insert ON public\.hs_files FOR INSERT TO authenticated/);
    const readStart = sql.indexOf('CREATE POLICY hs_files_consultancy_visit_read');
    const readBody = sql.slice(readStart, sql.indexOf(';', readStart) + 1);
    expect(readBody).toMatch(/entity_type = 'visit_observation'/);
    expect(readBody).toMatch(/'consultancy\.client_access'/);
    const insertStart = sql.indexOf('CREATE POLICY hs_files_consultancy_visit_insert');
    const insertBody = sql.slice(insertStart, sql.indexOf(';', insertStart) + 1);
    expect(insertBody).toMatch(/entity_type = 'visit_observation'/);
    expect(insertBody).toMatch(/'consultancy\.service_manage'/);
    // the two pre-existing policies are untouched — never redefined here
    expect(sql).not.toMatch(/CREATE POLICY hs_files_client_read/);
    expect(sql).not.toMatch(/CREATE POLICY hs_files_client_insert/);
  });

  it('one new storage policy for hs-evidence, scoped to visit_observation, gated on consultancy.service_manage', () => {
    const start = sql.indexOf('CREATE POLICY hs_evidence_consultancy_visit_insert');
    const body = sql.slice(start, sql.indexOf(';', start) + 1);
    expect(body).toMatch(/bucket_id = 'hs-evidence'/);
    expect(body).toMatch(/\(storage\.foldername\(name\)\)\[2\] = 'visit_observation'/);
    expect(body).toMatch(/'consultancy\.service_manage'/);
  });
});
