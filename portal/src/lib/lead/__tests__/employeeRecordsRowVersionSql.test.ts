// Pins migration 197 (Core-OS 360 Completion Programme, Phase 28,
// Group 2 — the remaining slice of gap-ledger row C1.12, "optimistic
// locking on shared records"). The Phase-24 slice
// (consultancy_visit_reports, migration 190) is separately pinned in
// admin's visitReportOptimisticLockingSql.test.ts.
//
// Checked live before writing this migration: EmployeeRecordsClient.tsx's
// edit-form save was an unconditional `.update(body).eq('id', editingId)`
// — the exact "last write wins" scenario Phase 1 handover §H named.
// docs/CORE_OS_360_PHASE28_PLAN.md records the investigation.
//
// The live database is the real check (a rolled-back probe run against
// project sbmekaviwkiyorvmtgcu before this migration was applied); this
// stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE_SAFE_COLUMNS } from '../employeePrivate';

const sql = readFileSync(
  join(__dirname, '../../../../../supabase/migrations/197_employee_records_row_version.sql'),
  'utf8',
);

describe('employee_records row_version (197)', () => {
  it('adds row_version as a NOT NULL integer defaulting to 1', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1/);
  });

  it('grants the new column to authenticated, additively — never rewrites 131\'s own REVOKE', () => {
    expect(sql).toMatch(/GRANT SELECT \(row_version\) ON public\.employee_records TO authenticated/);
    expect(sql).not.toMatch(/REVOKE SELECT ON public\.employee_records/);
  });

  it('EMPLOYEE_SAFE_COLUMNS carries row_version, so a client read can condition an update on it', () => {
    expect(EMPLOYEE_SAFE_COLUMNS.split(',')).toContain('row_version');
  });

  it('the INSERT-time trigger (fill) forces row_version to 1, ignoring anything the caller sent', () => {
    const fillFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.employee_records_row_version_fill()'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.employee_records_row_version_touch()'),
    );
    expect(fillFn).toMatch(/NEW\.row_version := 1;/);
  });

  it('the UPDATE-time trigger (touch) always advances OLD.row_version + 1, never trusts a caller-sent value', () => {
    const touchFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.employee_records_row_version_touch()'));
    expect(touchFn).toMatch(/NEW\.row_version := OLD\.row_version \+ 1;/);
    // The overwrite must be unconditional — no `IF NEW.row_version ...`
    // branch that would let a caller-sent value survive under any
    // condition.
    expect(touchFn).not.toMatch(/IF\s+NEW\.row_version/);
  });

  it('both trigger functions are SECURITY INVOKER (the table\'s own existing convention), revoked from every session role', () => {
    for (const fn of ['employee_records_row_version_fill', 'employee_records_row_version_touch']) {
      const def = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}()`));
      const header = def.slice(0, def.indexOf('AS $$'));
      expect(header, `${fn} header`).not.toMatch(/SECURITY DEFINER/);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('both triggers are newly created — this table had no row_version trigger before', () => {
    expect(sql).toMatch(/CREATE TRIGGER employee_records_row_version_fill\s+BEFORE INSERT ON public\.employee_records/);
    expect(sql).toMatch(/CREATE TRIGGER employee_records_row_version_touch\s+BEFORE UPDATE ON public\.employee_records/);
  });

  it('touches neither the audit trigger nor the outbox trigger — row_version is bookkeeping, not a fact worth reporting in either whitelist', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?TRIGGER employee_records_audit\b/);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?TRIGGER employee_records_platform_event\b/);
  });
});
