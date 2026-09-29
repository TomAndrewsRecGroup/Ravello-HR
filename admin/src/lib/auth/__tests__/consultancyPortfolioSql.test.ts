// Pins migration 167 (Core-OS 360 Phase 6, Group 1: consultancy
// portfolio access foundation). The live database is the real check
// (supabase/probes/167_consultancy_portfolio_foundation.sql, 16/16
// pass); this stops the migration file drifting from what was applied
// and pins the two properties every later Phase 6 view depends on: a
// grant issued under an ended/expired organisation_relationships row
// stops working everywhere it is checked, and the one cross-client read
// (portfolio_organisations) can never see more than the caller's own
// valid grants.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/167_consultancy_portfolio_foundation.sql'), 'utf8');

// LAST definition wins — has_capability is CREATE OR REPLACEd twice in
// this migration (once for the relationship-cascade fix, again for
// access_scope enforcement); lastIndexOf matches what is actually live,
// the same "latest definition wins" rule this codebase applies to every
// migration file re-creating a function or trigger more than once.
function fn(src: string, name: string, terminator = '$$;'): string {
  // CREATE OR REPLACE only — a GRANT/REVOKE line further down the file
  // also contains the bare "FUNCTION public.<name>(" substring and would
  // otherwise win a plain lastIndexOf search.
  const start = src.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} not defined`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf(terminator, start));
}

describe('Consultancy portfolio foundation (167)', () => {
  it('grant_relationship_current treats a NULL via_relationship_id as always current, and checks status + both date bounds otherwise', () => {
    const f = fn(sql, 'grant_relationship_current');
    expect(f).toMatch(/p_via_relationship_id IS NULL OR EXISTS/);
    expect(f).toMatch(/r\.status = 'active'/);
    expect(f).toMatch(/r\.valid_from <= current_date/);
    expect(f).toMatch(/r\.valid_until IS NULL OR r\.valid_until >= current_date/);
  });

  it('is called from every place a grant\'s validity is checked: my_active_grant, has_capability, set_active_organisation, my_organisations, portfolio_organisations', () => {
    for (const name of ['my_active_grant', 'has_capability', 'set_active_organisation', 'my_organisations', 'portfolio_organisations']) {
      const f = fn(sql, name, name === 'set_active_organisation' ? 'END $$;' : '$$;');
      expect(f, name).toMatch(/grant_relationship_current\(g\.via_relationship_id\)/);
    }
  });

  it('portfolio_organisations is SECURITY DEFINER, filters to auth.uid() itself, and excludes the home organisation', () => {
    const f = fn(sql, 'portfolio_organisations');
    expect(f).toMatch(/SECURITY DEFINER/);
    expect(f).toMatch(/g\.user_id = auth\.uid\(\)/);
    // No UNION with the profiles/companies home-org branch my_organisations() has.
    expect(f).not.toMatch(/UNION ALL/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.portfolio_organisations\(\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.portfolio_organisations\(\) TO authenticated/);
  });

  it('access_scope_allows: full is unrestricted, and a narrower scope never grants what full does not already cover', () => {
    const f = fn(sql, 'access_scope_allows');
    expect(f).toMatch(/WHEN 'full' THEN true/);
    for (const scope of ['health_safety', 'hr', 'recruitment']) {
      expect(f, scope).toMatch(new RegExp(`WHEN '${scope}' THEN p_cap = ANY`));
    }
    expect(f).toMatch(/ELSE true/); // an unrecognised scope fails open to 'full', never silently refuses everything
  });

  it('a health_safety scope never appears alongside hr.sensitive.read or hr.sensitive.write, and a hr scope never appears alongside riddor.review', () => {
    const hsBranch = sql.slice(sql.indexOf("WHEN 'health_safety' THEN"), sql.indexOf("WHEN 'hr' THEN"));
    expect(hsBranch).not.toMatch(/hr\.sensitive\.(read|write)/);
    const hrBranch = sql.slice(sql.indexOf("WHEN 'hr' THEN"), sql.indexOf("WHEN 'recruitment' THEN"));
    expect(hrBranch).not.toMatch(/riddor\.review|incident\.sensitive\.read/);
  });

  it('has_capability calls access_scope_allows on the grant branch only, never on the home-org branch (a home role is never scope-limited)', () => {
    const f = fn(sql, 'has_capability');
    const homeAndGrant = f.split('UNION ALL');
    expect(homeAndGrant.length).toBe(2);
    expect(homeAndGrant[0]).not.toMatch(/access_scope_allows/);
    expect(homeAndGrant[1]).toMatch(/access_scope_allows\(g\.access_scope, p_cap\)/);
  });

  it('seeds exactly one new capability, consultancy.service_manage, not sensitive', () => {
    expect(sql).toMatch(/\('consultancy\.service_manage',\s+'[^']+',\s+false\)/);
  });

  it('grants consultancy.service_manage to both consultancy roles and platform staff, never to a plain client role', () => {
    const m = sql.match(/\('consultancy\.service_manage',\s+ARRAY\[([^\]]*)\]\)/);
    expect(m).toBeTruthy();
    const roles = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    expect(roles.sort()).toEqual(['consultancy_owner', 'consultant', 'platform_staff', 'platform_super_admin'].sort());
  });

  it('the two genuinely NEW functions (grant_relationship_current, portfolio_organisations) are not executable by anon — the other four keep whatever grant their original migration already gave them, which CREATE OR REPLACE preserves', () => {
    for (const name of ['grant_relationship_current', 'portfolio_organisations']) {
      const re = new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon`);
      expect(sql, name).toMatch(re);
    }
  });
});
