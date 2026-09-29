// Pins migration 176 (Core-OS 360 Phase 7, Group 5: consultancy_visit_
// reports — the Report Builder's versioning/distribution schema). The
// live database is the real check
// (supabase/probes/176_consultancy_visit_reports.sql, 8/8 pass); this
// stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISIT_REPORT_STATUSES } from '../vocab';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/176_consultancy_visit_reports.sql'), 'utf8');

describe('Consultancy visit reports (176)', () => {
  it('status matches VISIT_REPORT_STATUSES exactly', () => {
    const m = sql.match(/status\s+text NOT NULL DEFAULT 'draft' CHECK \(status IN \(([^)]*)\)\)/);
    expect(m, 'status CHECK not found').toBeTruthy();
    const values = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    expect(values.sort()).toEqual([...VISIT_REPORT_STATUSES].sort());
  });

  it('organisation columns are derived from the visit, never trusted from the caller', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.consultancy_visit_report_fill'), sql.indexOf('REVOKE ALL ON FUNCTION public.consultancy_visit_report_fill'));
    expect(body).toMatch(/NEW\.consultancy_organisation_id := v_consultancy;/);
    expect(body).toMatch(/NEW\.client_organisation_id := v_client;/);
  });

  it('a revision must supersede a report for the SAME visit', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.consultancy_visit_report_fill'), sql.indexOf('REVOKE ALL ON FUNCTION public.consultancy_visit_report_fill'));
    expect(body).toMatch(/prev_visit IS DISTINCT FROM NEW\.visit_id/);
    expect(body).toMatch(/ERRCODE = '42501'/);
  });

  it('visit_id/organisation/supersedes_id are immutable after creation', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.consultancy_visit_report_touch'), sql.indexOf('REVOKE ALL ON FUNCTION public.consultancy_visit_report_touch'));
    expect(body).toMatch(/NEW\.visit_id IS DISTINCT FROM OLD\.visit_id/);
    expect(body).toMatch(/NEW\.supersedes_id IS DISTINCT FROM OLD\.supersedes_id/);
  });

  it('the supersede roll fires only on a genuine transition TO issued, and supersedes every sibling sharing the same parent', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.consultancy_visit_report_supersede_roll'), sql.indexOf('REVOKE ALL ON FUNCTION public.consultancy_visit_report_supersede_roll'));
    expect(body).toMatch(/NEW\.status = 'issued' AND OLD\.status IS DISTINCT FROM 'issued'/);
    expect(body).toMatch(/WHERE supersedes_id = NEW\.supersedes_id AND id <> NEW\.id AND status = 'issued'/);
    expect(body).toMatch(/WHERE id = NEW\.supersedes_id AND status = 'issued'/);
  });

  it('RLS is portfolio-wide for the consultancy (my_home_company_id, never my_company_id), gated on consultancy.service_manage', () => {
    const start = sql.indexOf('CREATE POLICY consultancy_visit_reports_consultancy_all');
    const body = sql.slice(start, sql.indexOf(';', sql.indexOf('WITH CHECK', start)) + 1);
    expect(body).toMatch(/consultancy_organisation_id = \(SELECT public\.my_home_company_id\(\)\)/);
    expect(body).toMatch(/'consultancy\.service_manage'/);
  });

  it('a client sees issued/superseded, never a draft', () => {
    const start = sql.indexOf('CREATE POLICY consultancy_visit_reports_client_read');
    const body = sql.slice(start, sql.indexOf(';', start) + 1);
    expect(body).toMatch(/client_organisation_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(body).toMatch(/status IN \('issued', 'superseded'\)/);
    expect(body).not.toContain("'draft'");
  });

  it('never whitelists free-text summary/recommendations in the audit trail', () => {
    const start = sql.lastIndexOf('CREATE TRIGGER consultancy_visit_reports_audit');
    const body = sql.slice(start, sql.indexOf(');', start));
    expect(body).not.toContain('summary');
    expect(body).not.toContain('recommendations');
  });

  it('calls apply_write_guard()', () => {
    expect(sql).toMatch(/apply_write_guard\('public\.consultancy_visit_reports'\)/);
  });

  it('no outbox trigger — the issue route is the one controlled entry point that notifies synchronously', () => {
    expect(sql).not.toMatch(/platform_event_row/);
  });
});
