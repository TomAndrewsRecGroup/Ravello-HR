import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// H&S is the first part of the platform where people OUTSIDE Core OS 360
// and the client hold a login (providers, 094). They can call PostgREST
// directly with it, so the SQL is the boundary, and these are the
// properties of it that must survive every later H&S migration:
//
//   * every hs_ table has RLS on and a staff policy;
//   * no policy is USING (true), and none is granted TO public / anon;
//   * every policy that names neither staff nor the caller's company
//     goes through hs_can_access / hs_can_write — the one place the
//     assignment's scope, status and date window are checked;
//   * the timeline, completions, activities and files cannot be edited
//     or deleted by a session;
//   * every source table writes to the timeline (an _hs_event trigger).
//
// Add each new H&S migration to FILES.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const FILES = ['094_hs_providers_access.sql', '095_hs_core.sql'];
const sql = FILES.map(f => readFileSync(`${MIG}/${f}`, 'utf8')).join('\n');

const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(hs_[a-z_]+)/g)].map(m => m[1]);

type Policy = { name: string; table: string; body: string };
const policies: Policy[] = [...sql.matchAll(/CREATE POLICY (\w+) ON (?:public\.)?([\w.]+)([\s\S]*?);/g)]
  .map(m => ({ name: m[1], table: m[2].replace(/^public\./, ''), body: m[3] }));

describe('H&S RLS shape', () => {
  it('finds the tables (so the rest is not vacuous)', () => {
    expect(tables).toEqual(expect.arrayContaining([
      'hs_providers', 'hs_provider_companies', 'hs_sites', 'hs_register_completions',
      'hs_activities', 'hs_files', 'hs_events',
    ]));
  });

  it.each(tables)('%s has RLS enabled and a staff policy', (t) => {
    expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    expect(policies.some(p => p.table === t && /_staff_(all|read)$/.test(p.name) && /is_tps_staff\(\)/.test(p.body))).toBe(true);
  });

  it('no policy is open', () => {
    for (const p of policies) {
      expect(p.body, p.name).not.toMatch(/USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
      expect(p.body, p.name).not.toMatch(/TO\s+(public|anon)\b/i);
      expect(p.body, p.name).toMatch(/TO authenticated/);
    }
  });

  it('every non-staff, non-own-company policy is gated by hs_can_access / hs_can_write or the caller\'s own provider', () => {
    for (const p of policies) {
      if (/is_tps_staff\(\)/.test(p.body) && !/hs_can_/.test(p.body)) continue;          // staff
      if (/my_company_id\(\)/.test(p.body)) continue;                                  // the client's own rows
      expect(p.body, p.name).toMatch(/hs_can_access|hs_can_write|my_hs_provider_id\(\)/);
    }
  });

  it('writes by a provider need hs_can_write, never just hs_can_access', () => {
    for (const p of policies.filter(p => /FOR (INSERT|UPDATE)/.test(p.body) && /provider/.test(p.name))) {
      expect(p.body, p.name).toMatch(/hs_can_write/);
      expect(p.body, p.name).not.toMatch(/hs_can_access/);
    }
  });

  it('the timeline and recorded evidence cannot be rewritten by a session', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.hs_events FROM PUBLIC, anon, authenticated/);
    for (const t of ['hs_register_completions', 'hs_activities', 'hs_files']) {
      expect(sql).toMatch(new RegExp(`REVOKE UPDATE, DELETE, TRUNCATE ON public\\.${t}\\s+FROM PUBLIC, anon, authenticated`));
    }
    expect(policies.filter(p => p.table === 'hs_events' && !/FOR SELECT/.test(p.body))).toEqual([]);
  });

  it('every SECURITY DEFINER function is revoked from anon', () => {
    // The header only: from the name to the body's opening AS $$.
    const definers = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)AS \$\$/g)]
      .filter(m => /SECURITY DEFINER/.test(m[2])).map(m => m[1]);
    expect(definers.length).toBeGreaterThan(10);
    for (const f of definers) {
      expect(sql, f).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)\\s+FROM PUBLIC, anon`));
    }
  });
});

describe('every H&S source table writes to the Safety Timeline', () => {
  const SOURCES = ['compliance_items', 'hs_register_completions', 'hs_activities', 'hs_files', 'hs_sites', 'hs_provider_companies'];
  it.each(SOURCES)('%s has an AFTER _hs_event trigger', (t) => {
    expect(sql).toMatch(new RegExp(`CREATE TRIGGER ${t}_hs_event\\s+AFTER [A-Z ]+ ON public\\.${t}`));
  });

  it('every hs_ table except the timeline itself and the provider directory is a source', () => {
    const exempt = new Set(['hs_events', 'hs_providers']);
    for (const t of tables.filter(t => !exempt.has(t))) expect(SOURCES, t).toContain(t);
  });
});
