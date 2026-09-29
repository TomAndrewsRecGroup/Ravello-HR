// Pins migration 168 (Core-OS 360 Phase 6, Group 2: service scope,
// consultancy visits, client_health_snapshots columns). The live
// database is the real check (supabase/probes/168_consultancy_service_
// scope_visits_health.sql, 10/10 pass — including the first draft's own
// real RLS bug, caught live, where the write policy checked
// consultancy_organisation_id = my_company_id() and so only ever worked
// while impossibly "active in your own consultancy home"); this stops
// the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REVIEW_FREQUENCIES, SERVICE_SCOPE_STATUSES, SERVICE_TYPES, VISIT_STATUSES, VISIT_TYPES,
} from '../vocab';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/168_consultancy_service_scope_visits_health.sql'), 'utf8');
// consultancy_visits.status was replaced by migration 173 (Phase 7,
// Group 1) — the status assertion below reads THAT file, not 168's own
// now-superseded CHECK text, the same "latest definition wins"
// principle tenancySql.test.ts/platformEventsSql.test.ts already use.
const sql173 = readFileSync(join(__dirname, '../../../../../supabase/migrations/173_consultant_visit_workflow.sql'), 'utf8');

function checkList(source: string, column: string): string[] {
  const re = new RegExp(`${column}\\s+text[^\\n]*CHECK \\([^)]*IN \\(([^)]*)\\)`);
  const m = source.match(re);
  expect(m, `${column} CHECK not found`).toBeTruthy();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
}

describe('Service scope + consultancy visits (168)', () => {
  it('service_type / status / review_frequency CHECKs match the TS vocabulary exactly', () => {
    expect(checkList(sql, 'service_type').sort()).toEqual([...SERVICE_TYPES].sort());
    expect(checkList(sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.consultancy_service_scopes')), 'status').sort())
      .toEqual([...SERVICE_SCOPE_STATUSES].sort());
    expect(checkList(sql, 'review_frequency').sort()).toEqual([...REVIEW_FREQUENCIES].sort());
  });

  it('visit_type CHECK (168, unchanged) matches the TS vocabulary exactly', () => {
    const visitsTable = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.consultancy_visits'));
    expect(checkList(visitsTable, 'visit_type').sort()).toEqual([...VISIT_TYPES].sort());
  });

  it('status CHECK (superseded by 173) matches the TS vocabulary exactly — never 168\'s own now-stale 3-value list', () => {
    const re = /ADD CONSTRAINT consultancy_visits_status_check\s+CHECK \(status IN \(([^)]*)\)\)/;
    const m = sql173.match(re);
    expect(m, 'status CHECK not found in 173').toBeTruthy();
    const values = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    expect(values.sort()).toEqual([...VISIT_STATUSES].sort());
  });

  it('both tables refuse consultancy_organisation_id = client_organisation_id', () => {
    expect(sql).toMatch(/consultancy_organisation_id <> client_organisation_id/g);
    const count = (sql.match(/consultancy_organisation_id <> client_organisation_id/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('both guard triggers check consultancy_relationship_live, not just the grant', () => {
    for (const name of ['consultancy_service_scope_guard', 'consultancy_visit_guard']) {
      const start = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      const body = sql.slice(start, sql.indexOf('END $$;', start));
      expect(body, name).toMatch(/consultancy_relationship_live\(NEW\.consultancy_organisation_id, NEW\.client_organisation_id\)/);
    }
  });

  it('the consultancy-side RLS policies are PORTFOLIO-WIDE: my_home_company_id() (not my_company_id()) plus has_capability keyed on the ROW\'s client_organisation_id, not the active org', () => {
    for (const [table, cap] of [
      ['consultancy_service_scopes', 'consultancy.client_access'], ['consultancy_service_scopes', 'consultancy.service_manage'],
      ['consultancy_visits', 'consultancy.client_access'], ['consultancy_visits', 'consultancy.service_manage'],
    ]) {
      const re = new RegExp(
        `consultancy_organisation_id = \\(SELECT public\\.my_home_company_id\\(\\)\\)\\s*\\n\\s*AND \\(SELECT public\\.has_capability\\(${table}\\.client_organisation_id, '${cap}'\\)\\)`,
      );
      expect(sql, `${table}/${cap}`).toMatch(re);
    }
    // The bug this test exists to prevent regressing: no policy anywhere
    // in this file may gate on the single-valued my_company_id() for
    // the consultancy_organisation_id comparison.
    expect(sql).not.toMatch(/consultancy_organisation_id = \(SELECT public\.my_company_id\(\)\)/);
  });

  it('the client-side read policies are the ordinary single-org shape — a client user is never granted elsewhere', () => {
    expect(sql).toMatch(/CREATE POLICY consultancy_service_scopes_client_read[\s\S]*?client_organisation_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(sql).toMatch(/CREATE POLICY consultancy_visits_client_read[\s\S]*?client_organisation_id = \(SELECT public\.my_company_id\(\)\)/);
  });

  it('there is no client write policy on either table — nothing here is self-certified', () => {
    expect(sql).not.toMatch(/consultancy_service_scopes_client_write/);
    expect(sql).not.toMatch(/consultancy_visits_client_write/);
  });

  it('calls apply_write_guard() on both tables', () => {
    expect(sql).toMatch(/apply_write_guard\('public\.consultancy_service_scopes'\)/);
    expect(sql).toMatch(/apply_write_guard\('public\.consultancy_visits'\)/);
  });

  it('audit_row is wired for both tables, attributed to the CLIENT organisation, and never whitelists free text', () => {
    const FORBIDDEN = /^(included_scope|excluded_scope|notes|commercial_reference)$/;
    const triggers = [...sql.matchAll(/EXECUTE FUNCTION public\.audit_row\(\s*\n?\s*'([a-z_]+)',\s*'([a-z_]+)'([^)]*)\)/g)];
    expect(triggers.length).toBe(2);
    for (const [, , orgCol, rest] of triggers) {
      expect(orgCol).toBe('client_organisation_id');
      const cols = [...rest.matchAll(/'([^']+)'/g)].map(x => x[1]);
      for (const c of cols) expect(c, rest).not.toMatch(FORBIDDEN);
    }
  });

  it('no SECURITY DEFINER function this migration adds is executable by anon', () => {
    for (const name of ['consultancy_relationship_live', 'consultancy_service_scope_guard', 'consultancy_visit_guard']) {
      const re = new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon`);
      expect(sql, name).toMatch(re);
    }
  });

  it('client_health_snapshots gains all 13 Phase 6 portfolio columns, additive only (IF NOT EXISTS)', () => {
    const cols = [
      'open_critical_actions', 'overdue_legal_evaluations', 'overdue_controlled_documents',
      'open_incident_investigations', 'safety_critical_gaps', 'workers_not_ready', 'assets_unavailable',
      'major_audit_findings', 'contractor_expiring', 'environmental_permits_expiring',
      'management_reviews_due', 'outstanding_service_requests', 'next_consultant_visit_date',
    ];
    for (const c of cols) {
      expect(sql, c).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\s`));
    }
  });
});
