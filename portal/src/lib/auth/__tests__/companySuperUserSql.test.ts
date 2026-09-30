import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCompanySuperUser } from '../companyAdmin';

// Core-OS 360 Completion Programme, Phase 28, Group 1 (C1.13).
//
// isCompanySuperUser() replaces 7 independently-spelled copies of
// `role === 'client_admin' || role === 'tps_admin'` across the portal
// app with one named function mirroring the database's OWN write gate
// for these tables (policy_acknowledgements, onboarding/offboarding
// instances + templates, employee_records, company_calendar_events):
// `is_company_super_user() OR is_tps_staff()`.
//
// is_company_super_user() is defined once, in migration 117, and
// pinned here against that file's own text — this codebase's standing
// "read from pg_policies/pg_proc, not migration files" rule applies to
// the LIVE SEMANTICS of a function, not to verifying a specific
// migration's own text still says what it always said.
//
// is_tps_staff() has NO defining migration anywhere in this repo (grepped:
// zero files match `CREATE (OR REPLACE )?FUNCTION public.is_tps_staff`) —
// it predates this repo's migration history and was created directly in
// the Supabase SQL editor, the same situation this codebase's own
// CLAUDE.md already documents for other pre-migration-era objects. Its
// body below was read LIVE via execute_sql against project
// sbmekaviwkiyorvmtgcu on 2026-09-30 and is embedded as a snapshot,
// not re-verified against a migration file that does not exist:
//
//   CREATE OR REPLACE FUNCTION public.is_tps_staff()
//    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $function$
//     SELECT EXISTS(
//       SELECT 1 FROM profiles
//        WHERE id = auth.uid() AND role = 'tps_admin'
//     );
//    $function$

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const m117 = readFileSync(`${MIG}/117_core_tenancy.sql`, 'utf8');

const LIVE_IS_TPS_STAFF_BODY = `
  SELECT EXISTS(
    SELECT 1 FROM profiles
     WHERE id = auth.uid() AND role = 'tps_admin'
  );
`;

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}()`);
  expect(start, `${name} defined in 117`).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return sql.slice(open + 2, close);
}

describe('is_company_super_user() — pinned against migration 117', () => {
  const body = fnBody(m117, 'is_company_super_user');

  it('evaluates get_my_role() against the client_admin literal', () => {
    expect(body).toMatch(/public\.get_my_role\(\)/);
    expect(body).toMatch(/= 'client_admin'/);
  });

  it('defaults to false, never null or an error, when get_my_role() is null', () => {
    // COALESCE(..., false) — the "fails closed" shape this codebase
    // requires of every boolean security predicate.
    expect(body).toMatch(/COALESCE\(/);
    expect(body).toMatch(/,\s*false\)/);
  });

  it('is get_my_role()-based, so a consultant grant is correctly excluded', () => {
    // get_my_role() resolves via my_active_grant().legacy_role while a
    // grant is active — read_only's own legacy_role is 'client_user',
    // never 'client_admin' (confirmed live against access_roles before
    // this test was written) — so this predicate is already
    // grant-aware and cannot be fooled by a read_only consultant.
    // Nothing to assert about my_active_grant() itself here: that is
    // tenancySql.test.ts's own job, not this file's.
    expect(body).not.toMatch(/my_active_grant/);
  });
});

describe('is_tps_staff() — pinned against a live snapshot (no migration defines it)', () => {
  it('checks the caller\'s own profiles row for role = tps_admin', () => {
    expect(LIVE_IS_TPS_STAFF_BODY).toMatch(/profiles/);
    expect(LIVE_IS_TPS_STAFF_BODY).toMatch(/role = 'tps_admin'/);
    expect(LIVE_IS_TPS_STAFF_BODY).toMatch(/id = auth\.uid\(\)/);
  });
});

describe('isCompanySuperUser() — mirrors is_company_super_user() OR is_tps_staff()', () => {
  it('is true for tps_admin staff regardless of their profiles.role value', () => {
    expect(isCompanySuperUser({ role: 'tps_admin', isTpsStaff: true })).toBe(true);
    expect(isCompanySuperUser({ role: 'client_user', isTpsStaff: true })).toBe(true);
    expect(isCompanySuperUser({ role: 'hs_provider', isTpsStaff: true })).toBe(true);
  });

  it('is true for client_admin without staff status', () => {
    expect(isCompanySuperUser({ role: 'client_admin', isTpsStaff: false })).toBe(true);
  });

  it('is false for every other legacy role with no staff status', () => {
    for (const role of ['client_user', 'client_editor', 'tps_client', 'hs_provider']) {
      expect(isCompanySuperUser({ role, isTpsStaff: false }), role).toBe(false);
    }
  });

  it('is an OR, never an AND — either condition alone is sufficient', () => {
    // Reintroducing this as an AND (the mutation this test exists to
    // catch) would lock every genuine tps_admin session with a
    // non-client_admin profiles.role out of every page using this
    // helper — reproducing exactly the "42501 on a shown button" class
    // of bug this consolidation exists to prevent, just via a bad edit
    // to the helper itself rather than a copy-paste drift across files.
    const andWouldGive = (s: { role: string; isTpsStaff: boolean }) => s.isTpsStaff && s.role === 'client_admin';
    const session = { role: 'client_admin', isTpsStaff: false };
    expect(isCompanySuperUser(session)).not.toBe(andWouldGive(session));
    expect(isCompanySuperUser(session)).toBe(true);
  });
});
