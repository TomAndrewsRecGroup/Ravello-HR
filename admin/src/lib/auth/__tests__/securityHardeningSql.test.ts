// Pins migration 088's guards. The live database is the real check
// (supabase/probes/088_security_hardening.sql, run 2026-09-24: all four
// attacks blocked, ordinary edits unaffected); this stops the migration
// file itself drifting from what was applied, e.g. a column quietly
// dropped from a guard in a later edit.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../../../supabase/migrations/088_security_hardening.sql'),
  'utf8',
);

function body(fn: string): string {
  const start = sql.indexOf(`FUNCTION public.${fn}()`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start));
}

describe('088 security hardening', () => {
  it('guards profiles.role and profiles.company_id on update, and staff roles on insert', () => {
    const b = body('profiles_guard_privileged');
    expect(b).toMatch(/NEW\.role IS DISTINCT FROM OLD\.role/);
    expect(b).toMatch(/NEW\.company_id IS DISTINCT FROM OLD\.company_id/);
    expect(b).toMatch(/TG_OP = 'INSERT'[\s\S]*'tps_admin'/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.profiles/);
  });

  it('guards every commercial column on companies', () => {
    const b = body('companies_guard_commercial');
    for (const col of [
      'feature_flags', 'active', 'archived_at', 'slug', 'account_owner_id',
      'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id',
      'monthly_retainer_pence', 'subscription_status', 'subscription_started_at', 'billing_currency',
    ]) {
      expect(b).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`));
    }
  });

  it('keys the bypass on the PostgREST role, not on auth.uid() being null', () => {
    // auth.uid() is NULL for anon AND the service role, so a guard keyed
    // on it would wave anon through. current_user only works if the
    // functions stay SECURITY INVOKER.
    for (const fn of ['profiles_guard_privileged', 'companies_guard_commercial']) {
      const b = body(fn);
      expect(b).toMatch(/current_user NOT IN \('authenticated', 'anon'\)/);
      expect(b).not.toMatch(/SECURITY DEFINER/);
      expect(b).not.toMatch(/auth\.uid\(\) IS NULL/);
    }
  });
});
