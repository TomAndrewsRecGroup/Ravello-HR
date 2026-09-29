// Pins migration 178 (Core-OS 360 Phase 13, Group 1: Board Assurance &
// Executive Reporting). The live database is the real check
// (supabase/probes/178_board_assurance_reports.sql, 19/19 PASS); this
// stops the migration file drifting from what was applied and pins
// the properties that, if lost, would let a draft report reach a
// client before being issued, let an issued report's content be
// silently rewritten, or let someone acknowledge a report for a
// company that isn't theirs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/178_board_assurance_reports.sql'), 'utf8');

describe('Board Assurance & Executive Reporting (178)', () => {
  it('RLS is enabled on both new tables', () => {
    expect(sql).toMatch(/ALTER TABLE public\.board_assurance_reports\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.board_assurance_acknowledgements ENABLE ROW LEVEL SECURITY/);
  });

  it('both tables have a staff ALL policy, and no policy is USING (true) or granted to anon', () => {
    expect(sql).toMatch(/CREATE POLICY board_assurance_reports_staff_all ON public\.board_assurance_reports FOR ALL TO authenticated[\s\S]*?is_tps_staff\(\)/);
    expect(sql).toMatch(/CREATE POLICY board_assurance_acknowledgements_staff_all ON public\.board_assurance_acknowledgements FOR ALL TO authenticated[\s\S]*?is_tps_staff\(\)/);
    expect(sql).not.toMatch(/USING \(true\)/);
    expect(sql).not.toMatch(/TO anon/);
  });

  it('board_assurance_reports has no client INSERT/UPDATE/DELETE policy — staff-generated only', () => {
    expect(sql).not.toMatch(/CREATE POLICY board_assurance_reports_(insert|update|delete)/);
  });

  it('the client read policy on reports requires status = issued', () => {
    expect(sql).toMatch(/CREATE POLICY board_assurance_reports_client_read ON public\.board_assurance_reports FOR SELECT TO authenticated\s+USING \(\s*status = 'issued'/);
  });

  it('acknowledgements: client may SELECT and INSERT, never UPDATE/DELETE', () => {
    expect(sql).toMatch(/CREATE POLICY board_assurance_acknowledgements_client_read ON public\.board_assurance_acknowledgements FOR SELECT TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY board_assurance_acknowledgements_client_insert ON public\.board_assurance_acknowledgements FOR INSERT TO authenticated/);
    expect(sql).not.toMatch(/CREATE POLICY board_assurance_acknowledgements_(update|delete)/);
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.board_assurance_acknowledgements FROM PUBLIC, anon, authenticated/);
  });

  it('reuses risk.read / risk.create — no new capability is seeded', () => {
    expect(sql).toMatch(/has_capability\(\(SELECT public\.my_company_id\(\)\), 'risk\.read'\)/);
    expect(sql).toMatch(/has_capability\(\(SELECT public\.my_company_id\(\)\), 'risk\.create'\)/);
    expect(sql).not.toMatch(/INSERT INTO public\.capabilities/);
    expect(sql).not.toMatch(/INSERT INTO public\.access_role_capabilities/);
  });

  it('report_data is frozen after generation — the guard refuses changing it, year, quarter or company_id', () => {
    expect(sql).toMatch(/NEW\.report_data IS DISTINCT FROM OLD\.report_data/);
    expect(sql).toMatch(/NEW\.year <> OLD\.year/);
    expect(sql).toMatch(/NEW\.quarter <> OLD\.quarter/);
    expect(sql).toMatch(/NEW\.company_id <> OLD\.company_id/);
  });

  it('status may only move draft -> issued, never back', () => {
    expect(sql).toMatch(/OLD\.status = 'issued' AND NEW\.status <> 'issued' THEN\s*\n\s*RAISE EXCEPTION/);
  });

  it('acknowledgements derive company_id, acknowledged_by and the name from the session/parent row, never the caller', () => {
    expect(sql).toMatch(/NEW\.company_id := v_company;/);
    expect(sql).toMatch(/NEW\.acknowledged_by := auth\.uid\(\);/);
    expect(sql).toMatch(/NEW\.acknowledged_by_name := COALESCE\(/);
  });

  it('acknowledging a non-issued report is refused by the fill trigger', () => {
    expect(sql).toMatch(/IF v_status <> 'issued' THEN\s*\n\s*RAISE EXCEPTION/);
  });

  it('the write guard is applied to the one client-writable table only', () => {
    expect(sql).toMatch(/apply_write_guard\('public\.board_assurance_acknowledgements'\)/);
    expect(sql).not.toMatch(/apply_write_guard\('public\.board_assurance_reports'\)/);
  });

  it('the outbox whitelist never includes report_data', () => {
    const m = sql.match(/platform_event_row\(([^)]*)\)/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/report_data/);
    expect(m![1]).toMatch(/'year'/);
    expect(m![1]).toMatch(/'quarter'/);
    expect(m![1]).toMatch(/'status'/);
  });

  it('acknowledgements are insert-only and have no outbox entry of their own', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS board_assurance_acknowledgements_fill/);
    expect(sql).not.toMatch(/CREATE TRIGGER board_assurance_acknowledgements_platform_event/);
  });

  it('every SECURITY DEFINER function in this migration is revoked from PUBLIC, anon and authenticated', () => {
    const fns = ['board_assurance_reports_guard', 'board_assurance_acknowledgements_fill'];
    for (const fn of fns) {
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('an audit trigger is present for both tables, identifying columns only', () => {
    expect(sql).toMatch(/audit_row\('board_assurance_report', 'company_id', 'year', 'quarter', 'status'\)/);
    expect(sql).toMatch(/audit_row\('board_assurance_acknowledgement', 'company_id', 'report_id', 'acknowledged_by'\)/);
  });
});
