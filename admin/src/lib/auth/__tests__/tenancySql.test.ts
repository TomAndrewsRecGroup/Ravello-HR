// Pins Core-OS 360 Phase 1 (migrations 117-120) in place.
//
// The live database is the real check: supabase/probes/117_119_phase1_
// tenancy.sql ran the spec's Laws Safety / ABC / XYZ / Independent
// tenancy against production in a rolled-back transaction (74 checks).
// These stop the migration files drifting from what was applied and pin
// the properties that, if lost, would silently reopen a hole:
//
//   * the TS capability matrix and the SQL seed agree in BOTH directions;
//   * my_company_id() only honours a LIVE grant (status + window);
//   * the 43 rewritten policies no longer grant tps_client or read
//     profiles directly;
//   * the read-only write guard is RESTRICTIVE and covers INSERT, UPDATE
//     and DELETE;
//   * audit_events is append-only for everyone, service role included,
//     and no audit trigger whitelists a sensitive column;
//   * a person link can never fail a referral/athlete/employee insert.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_ROLES, CAPABILITIES, CONSULTANCY_GRANTABLE_ROLES, READ_ONLY_ROLES, ROLE_CAPABILITIES,
  SENSITIVE_CAPABILITIES, homeRoleKey, roleHasCapability,
} from '../capabilities';

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const m117 = readFileSync(`${MIG}/117_core_tenancy.sql`, 'utf8');
const m118 = readFileSync(`${MIG}/118_sites_departments_people.sql`, 'utf8');
const m119 = readFileSync(`${MIG}/119_actions_documents_search.sql`, 'utf8');
const m120 = readFileSync(`${MIG}/120_actions_capability_insert.sql`, 'utf8');

function fn(src: string, name: string): string {
  const start = src.indexOf(`FUNCTION public.${name}(`);
  expect(start, `${name} not defined`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('$$;', start));
}

describe('capability catalogue: TypeScript ↔ SQL seed (117)', () => {
  const seed = new Map<string, string[]>();
  for (const m of m117.matchAll(/\('([a-z_]+)',\s+ARRAY\[([^\]]*)\]\)/g)) {
    seed.set(m[1], [...m[2].matchAll(/'([a-z_.]+)'/g)].map(x => x[1]).sort());
  }
  const sqlCaps = [...m117.matchAll(/^\s+\('([a-z_]+\.[a-z_.]+)',\s+'/gm)].map(x => x[1]).sort();

  it('declares the same capabilities', () => {
    expect(sqlCaps).toEqual([...CAPABILITIES].sort());
  });

  it('gives every role exactly the same capabilities in both places', () => {
    expect([...seed.keys()].sort()).toEqual([...ACCESS_ROLES].sort());
    for (const role of ACCESS_ROLES) {
      expect(seed.get(role), role).toEqual([...ROLE_CAPABILITIES[role]].sort());
    }
  });

  it('marks the same capabilities sensitive', () => {
    const sensitive = [...m117.matchAll(/\('([a-z_.]+)',\s+'[^']*(?:''[^']*)*',\s+true\)/g)].map(x => x[1]).sort();
    expect(sensitive).toEqual([...SENSITIVE_CAPABILITIES].sort());
  });

  it('agrees on read-only and consultancy-grantable roles', () => {
    const rows = [...m117.matchAll(/\('([a-z_]+)',\s+'[^']+',\s+'(platform|organisation)',\s*(NULL|'[a-z_]+'),\s*(true|false),\s*(true|false)\)/g)];
    expect(rows.filter(r => r[4] === 'true').map(r => r[1]).sort()).toEqual([...READ_ONLY_ROLES].sort());
    expect(rows.filter(r => r[5] === 'true').map(r => r[1]).sort()).toEqual([...CONSULTANCY_GRANTABLE_ROLES].sort());
  });

  it('maps legacy home roles identically (consultancy rows override)', () => {
    const rows = [...m117.matchAll(/\('([a-z_]+)','(any|consultancy)','([a-z_]+)'\)/g)];
    expect(rows.length).toBe(8);
    for (const [, legacy, kind, role] of rows) {
      expect(homeRoleKey(legacy, kind === 'consultancy' ? 'consultancy' : 'direct_client'), `${legacy}/${kind}`).toBe(role);
    }
    // a non-consultancy org falls back to the 'any' row
    expect(homeRoleKey('client_admin', 'direct_client')).toBe('organisation_admin');
  });

  it('keeps the privilege lines the model depends on', () => {
    expect(roleHasCapability('read_only', 'people.write')).toBe(false);
    expect(roleHasCapability('consultant', 'hr.sensitive.read')).toBe(false);
    expect(roleHasCapability('consultant', 'consultancy.manage_access')).toBe(false);
    expect(roleHasCapability('consultancy_owner', 'consultancy.manage_access')).toBe(true);
    expect(roleHasCapability('recruiter', 'hr.sensitive.read')).toBe(false);
    expect(roleHasCapability('organisation_admin', 'billing.manage')).toBe(false);
    for (const r of CONSULTANCY_GRANTABLE_ROLES) {
      expect(roleHasCapability(r, 'consultancy.manage_access'), r).toBe(false);
      expect(roleHasCapability(r, 'organisation.manage'), r).toBe(false);
    }
  });
});

describe('effective tenant (117)', () => {
  it('my_company_id honours only a LIVE grant for the active organisation', () => {
    const grant = fn(m117, 'my_active_grant');
    expect(grant).toMatch(/g\.active_status = 'active'/);
    expect(grant).toMatch(/g\.valid_from <= now\(\)/);
    expect(grant).toMatch(/g\.valid_until IS NULL OR g\.valid_until > now\(\)/);
    expect(grant).toMatch(/a\.user_id = auth\.uid\(\)/);
    expect(fn(m117, 'my_company_id')).toMatch(/COALESCE\(\s*\(SELECT organisation_id FROM public\.my_active_grant\(\)\),\s*\(SELECT company_id FROM profiles WHERE id = auth\.uid\(\)\)/);
  });

  it('a grant never overrides a platform role', () => {
    expect(fn(m117, 'get_my_role')).toMatch(/WHEN p\.role::text IN \('tps_admin','tps_client','hs_provider'\) THEN p\.role::text/);
  });

  it('switching requires a live grant, and grants/active rows have no session write path', () => {
    const sw = fn(m117, 'set_active_organisation');
    expect(sw).toMatch(/RAISE EXCEPTION 'No access to that organisation' USING ERRCODE = '42501'/);
    expect(m117).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.user_organisation_access FROM PUBLIC, anon, authenticated/);
    expect(m117).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.user_active_organisation FROM PUBLIC, anon, authenticated/);
  });

  it('a consultancy can only grant its own people, consultancy roles, on clients it serves', () => {
    const g = fn(m117, 'grant_organisation_access');
    expect(g).toMatch(/You cannot grant yourself access/);
    expect(g).toMatch(/organisation_type = 'consultancy'/);
    expect(g).toMatch(/consultancy_grantable/);
    expect(g).toMatch(/relationship_type = 'consultancy_client' AND status = 'active'/);
    expect(g).toMatch(/company_id = caller_home/);
  });
});

describe('the 43 rewritten policies (117)', () => {
  const rewrites = m117.slice(m117.indexOf('── 11.'));
  const policies = [...rewrites.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)([\s\S]*?);/g)];

  it('rewrites 43 policies', () => {
    expect(policies.length).toBe(43);
  });

  it('none grants tps_client, reads profiles or calls get_my_role directly', () => {
    for (const [, name, table, body] of policies) {
      expect(body, `${table}.${name}`).not.toMatch(/tps_client|FROM profiles|get_my_role/);
    }
  });
});

describe('read-only write guard (117)', () => {
  const guard = fn(m117, 'apply_write_guard');

  it('is RESTRICTIVE on INSERT, UPDATE and DELETE and never on SELECT', () => {
    expect(guard).toMatch(/write_guard_ins ON %s AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK \(\(SELECT public\.session_can_write\(\)\)\)/);
    expect(guard).toMatch(/write_guard_upd ON %s AS RESTRICTIVE FOR UPDATE TO authenticated USING \(\(SELECT public\.session_can_write\(\)\)\)/);
    expect(guard).toMatch(/write_guard_del ON %s AS RESTRICTIVE FOR DELETE TO authenticated USING \(\(SELECT public\.session_can_write\(\)\)\)/);
    expect(guard).not.toMatch(/FOR SELECT|FOR ALL/);
  });

  it('covers files, and every table 118/119 created', () => {
    expect(m117).toMatch(/SELECT public\.apply_write_guard\('storage\.objects'\)/);
    for (const t of ['departments', 'people']) expect(m118).toMatch(new RegExp(`apply_write_guard\\('public\\.${t}'\\)`));
    expect(m119).toMatch(/apply_write_guard\('public\.document_versions'\)/);
  });

  it('exempts only a user\'s own records and tables no session can write', () => {
    const list = m117.match(/c\.relname NOT IN \(([\s\S]*?)\)/)![1];
    expect([...list.matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort()).toEqual([
      'access_capabilities', 'access_role_capabilities', 'access_roles', 'audit_events', 'data_access_requests',
      'jev_decisions', 'legacy_role_map', 'notification_preferences', 'notifications', 'profiles',
      'user_active_organisation', 'user_organisation_access',
    ]);
  });
});

describe('audit trail (117)', () => {
  it('is append-only for every role, the service role included', () => {
    expect(m117).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.audit_events FROM PUBLIC, anon, authenticated, service_role/);
    expect(m117).toMatch(/BEFORE UPDATE OR DELETE ON public\.audit_events/);
    expect(m117).toMatch(/BEFORE TRUNCATE ON public\.audit_events/);
    const policies = [...m117.matchAll(/CREATE POLICY (\w+) ON public\.audit_events\s+FOR (\w+)/g)];
    expect(policies.every(p => p[2] === 'SELECT')).toBe(true);
  });

  it('no audit trigger whitelists a sensitive column', () => {
    const FORBIDDEN = /^(salary|ni_number|tax_code|date_of_birth|gender|ethnicity|disability_status|leave_token|notes|description|details|body|client_feedback|recruiter_notes|cv_text|phone|address|emergency_\w+|injured_person_name|immediate_action)$/;
    const all = [m117, m118, m119].join('\n');
    const triggers = [...all.matchAll(/EXECUTE FUNCTION public\.audit_row\(([^)]*)\)/g)];
    expect(triggers.length).toBeGreaterThanOrEqual(15);
    for (const t of triggers) {
      const cols = [...t[1].matchAll(/'([^']+)'/g)].map(x => x[1]).slice(2);
      for (const c of cols) expect(c, t[1]).not.toMatch(FORBIDDEN);
    }
  });

  it('audit_log() is service-role only', () => {
    expect(m117).toMatch(/REVOKE ALL ON FUNCTION public\.audit_log\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    expect(m117).toMatch(/GRANT EXECUTE ON FUNCTION public\.audit_log\([^)]*\) TO service_role;/);
  });
});

describe('people (118)', () => {
  it('a person link can never fail the insert it rides on', () => {
    const link = fn(m118, 'person_link_row');
    expect(link).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    expect(link).toMatch(/NEW\.person_id := NULL/);
    expect(fn(m118, 'person_link_profile')).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
  });

  it('matches a person by email within ONE organisation only', () => {
    expect(fn(m118, 'person_find_or_create')).toMatch(/WHERE company_id = p_company AND email = e/);
  });

  it('people RLS is derivative: a hidden candidate stays a hidden person', () => {
    const read = m118.slice(m118.indexOf('CREATE POLICY people_read'), m118.indexOf('DROP POLICY IF EXISTS people_org_write'));
    expect(read).toMatch(/EXISTS \(SELECT 1 FROM public\.candidates c WHERE c\.person_id = people\.id\)/);
    expect(read).toMatch(/worker_type IN \('employee','contractor','consultant','temporary_worker','former_employee'\)/);
    expect(read).toMatch(/has_capability\(company_id, 'people\.read'\)/);
  });

  it('carries no sensitive HR column', () => {
    const table = m118.slice(m118.indexOf('CREATE TABLE IF NOT EXISTS public.people'), m118.indexOf('CREATE INDEX IF NOT EXISTS people_company_idx'));
    expect(table).not.toMatch(/salary|ni_number|date_of_birth|gender|ethnicity|disability|health/);
  });

  it('cross-organisation links are refused by trigger', () => {
    expect(fn(m118, 'assert_same_org')).toMatch(/belongs to a different organisation/);
  });
});

describe('actions, documents, search (119, 120)', () => {
  it('keeps every existing action status', () => {
    expect(m119).toMatch(/CHECK \(status IN \('active','dismissed','complete','cancelled'\)\)/);
  });

  it('verification is separate from completion and cannot be self-verified', () => {
    const f = fn(m119, 'actions_lifecycle');
    expect(f).toMatch(/verified by someone other than the person who completed it/);
    expect(m119).toMatch(/actions_verified_needs_complete CHECK \(verified_at IS NULL OR status = 'complete'\)/);
  });

  it('versions are written only by trigger and never by a session', () => {
    expect(m119).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.document_versions FROM PUBLIC, anon, authenticated/);
    expect(m119).toMatch(/document_id\s+uuid REFERENCES public\.documents\(id\) ON DELETE SET NULL/);
  });

  it('search runs under the caller\'s own RLS', () => {
    expect(fn(m119, 'search_records')).toMatch(/SECURITY INVOKER/);
    expect(fn(m119, 'search_records')).not.toMatch(/SECURITY DEFINER/);
  });

  it('a client action insert is capability-gated and scoped to the active organisation', () => {
    expect(m120).toMatch(/company_id = \(SELECT public\.my_company_id\(\)\)\s+AND public\.has_capability\(company_id, 'actions\.assign'\)/);
  });
});
