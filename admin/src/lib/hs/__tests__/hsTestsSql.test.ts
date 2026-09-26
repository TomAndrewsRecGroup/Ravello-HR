import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HS_TEST_SOURCE_TYPES } from '../vocab';

// Migration 116 (Tests): its own shape test, the same reason
// policyAckSql.test.ts and profileAccessTokensSql.test.ts stand apart
// from the register's hsSqlShape.test.ts rather than folding in — this
// is a simple, never-redefined set of CHECKs and policies, not the
// "latest definition across many migrations" resolution that file
// exists for.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = readFileSync(`${MIG}/116_hs_tests.sql`, 'utf8');

function listAfter(anchor: RegExp): string[] {
  const m = sql.match(anchor);
  if (!m) throw new Error(`anchor not found: ${anchor}`);
  const rest = sql.slice(m.index! + m[0].length);
  const close = rest.search(/\)\)/);
  return [...rest.slice(0, close).matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
}

describe('116 hs_tests.sql', () => {
  it('source_type / source CHECKs match HS_TEST_SOURCE_TYPES', () => {
    expect(listAfter(/source_type\s+text NOT NULL CHECK \(source_type IN \(/).sort()).toEqual([...HS_TEST_SOURCE_TYPES].sort());
    expect(listAfter(/source\s+text NOT NULL CHECK \(source IN \(/).sort()).toEqual([...HS_TEST_SOURCE_TYPES].sort());
  });

  it('every table has RLS enabled', () => {
    for (const t of ['hs_tests', 'hs_test_sessions', 'hs_test_assignments', 'hs_test_submissions', 'hs_test_tokens']) {
      expect(sql, t).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  it('hs_tests and hs_test_sessions are staff-only — no client policy at all', () => {
    for (const t of ['hs_tests', 'hs_test_sessions']) {
      const clientPolicy = new RegExp(`CREATE POLICY \\w*client\\w* ON public\\.${t}`);
      expect(sql, t).not.toMatch(clientPolicy);
    }
  });

  it('hs_test_assignments and hs_test_submissions grant the client a READ-ONLY policy — never INSERT/UPDATE/ALL for a non-staff role', () => {
    for (const t of ['hs_test_assignments', 'hs_test_submissions']) {
      const m = sql.match(new RegExp(`CREATE POLICY \\w*client\\w* ON public\\.${t} FOR (\\w+)`));
      expect(m, t).not.toBeNull();
      expect(m![1], t).toBe('SELECT');
    }
  });

  it('hs_test_tokens has RLS on and NO policies at all — service role only', () => {
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.hs_test_tokens/);
  });

  it('hs_test_submissions is insert-only: no session may UPDATE, DELETE or TRUNCATE it', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.hs_test_submissions\s+FROM PUBLIC, anon, authenticated/);
  });

  it('every SECURITY DEFINER function here is revoked from anon and authenticated', () => {
    const definers = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(\)\s*\nRETURNS trigger\s*\nLANGUAGE plpgsql SECURITY DEFINER/g)].map(m => m[1]);
    expect(definers.length).toBeGreaterThanOrEqual(2);
    for (const f of definers) {
      expect(sql, f).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\(\\)\\s+FROM PUBLIC, anon, authenticated`));
    }
  });

  it('the fill trigger runs BEFORE INSERT and the after trigger runs AFTER INSERT, exactly once each', () => {
    expect(sql).toMatch(/CREATE TRIGGER hs_test_submission_fill\s+BEFORE INSERT ON public\.hs_test_submissions/);
    expect(sql).toMatch(/CREATE TRIGGER hs_test_submission_after\s+AFTER INSERT ON public\.hs_test_submissions/);
  });
});
