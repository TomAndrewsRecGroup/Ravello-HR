// Pins migration 195 (Core-OS 360 Completion Programme, Phase 26,
// Group 2: site/kiosk manual check-in/out with explicit site
// selection, closing gap-ledger row C14.7). The live database is the
// real check (a rolled-back probe: a client_admin with workforce.manage
// may insert a 'manual' row for their own company against an explicit
// site, a 'qr_scan' value via a client session is refused, a
// cross-tenant person is refused, a manual checkout succeeds, changing
// any column other than checked_out_at is refused, staff may change
// any column, and the existing service-role scan routes are entirely
// unaffected by the new guard — 7/7 passed, no trace left live); this
// stops the migration file drifting from what was applied and pins the
// properties a text scan CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/195_site_checkins_manual.sql'), 'utf8');

describe('site_checkins manual check-in/out (195)', () => {
  it('widens recorded_via to accept qr_scan and manual, never anything else', () => {
    expect(sql).toMatch(/DROP CONSTRAINT site_checkins_recorded_via_check/);
    expect(sql).toMatch(/CHECK \(recorded_via IN \('qr_scan', 'manual'\)\)/);
  });

  it('the manual INSERT policy requires the caller\'s own company, workforce.manage, and recorded_via = manual', () => {
    const start = sql.indexOf('CREATE POLICY site_checkins_client_manual_insert');
    const body = sql.slice(start, sql.indexOf(');', start) + 2);
    expect(body).toMatch(/FOR INSERT TO authenticated/);
    expect(body).toMatch(/company_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(body).toMatch(/has_capability\(\(SELECT public\.my_company_id\(\)\), 'workforce\.manage'\)/);
    expect(body).toMatch(/recorded_via = 'manual'/);
  });

  it('the manual UPDATE policy is company + capability scoped but NOT restricted to recorded_via = manual — a manager may close out a badge-scanned check-in too', () => {
    const start = sql.indexOf('CREATE POLICY site_checkins_client_manual_update');
    const body = sql.slice(start, sql.indexOf(');', start) + 2);
    expect(body).toMatch(/FOR UPDATE TO authenticated/);
    expect(body).toMatch(/company_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(body).toMatch(/has_capability\(\(SELECT public\.my_company_id\(\)\), 'workforce\.manage'\)/);
    expect(body).not.toMatch(/recorded_via = 'manual'/);
  });

  it('the new guard function refuses a non-staff session changing anything other than checked_out_at', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.site_checkins_manual_guard()');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).toMatch(/current_user IN \('authenticated', 'anon'\)/);
    expect(body).toMatch(/NOT public\.is_tps_staff\(\)/);
    for (const col of ['id', 'company_id', 'person_id', 'site_id', 'checked_in_at', 'recorded_via']) {
      expect(body, col).toMatch(new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`));
    }
    expect(body).not.toMatch(/checked_out_at IS DISTINCT FROM/);
    expect(body).toMatch(/RAISE EXCEPTION.*USING ERRCODE = '23514'/);
  });

  it('a service-role caller is exempt entirely — the two public scan routes are unaffected', () => {
    // No SECURITY DEFINER and no explicit REVOKE on the trigger function:
    // a service-role session's current_user is 'service_role', which the
    // guard's own `session boolean` never matches, so it is exempt by
    // construction regardless of grants.
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.site_checkins_manual_guard()');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });

  it('registers the new BEFORE UPDATE trigger exactly once', () => {
    expect(sql.match(/CREATE TRIGGER site_checkins_manual_guard/g)).toHaveLength(1);
    expect(sql).toMatch(/BEFORE UPDATE ON public\.site_checkins/);
  });
});
