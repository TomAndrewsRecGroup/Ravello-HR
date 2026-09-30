// Core-OS 360 Completion Programme, Phase 24, Group 2 (closes
// gap-ledger row C1.9 — "portal UI for consultancy owners to grant
// access"). This group ships NO new migration — it is the first
// caller of grant_organisation_access()/revoke_organisation_access()
// (117), which have existed, unused, since Phase 1. This test pins
// two things against the LIVE migration file rather than assuming:
// the RPC signatures the new page's client component calls by name
// (`p_user, p_org, p_role, p_valid_until, p_scope` /
// `p_grant`) haven't drifted, and the new ACCESS_SCOPES tuple
// (vocab.ts) matches user_organisation_access.access_scope's own
// CHECK exactly.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCESS_SCOPES } from '../vocab';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/117_core_tenancy.sql'), 'utf8');

describe('grant_organisation_access / revoke_organisation_access (117)', () => {
  it('grant_organisation_access keeps the exact parameter names/order the page RPC-calls by name', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.grant_organisation_access\(\s*p_user uuid, p_org uuid, p_role text, p_valid_until timestamptz DEFAULT NULL, p_scope text DEFAULT 'full'\)/,
    );
  });

  it('revoke_organisation_access keeps its single p_grant uuid parameter', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.revoke_organisation_access\(p_grant uuid\)/);
  });

  it('both RPCs are SECURITY DEFINER, granted only to authenticated (never anon)', () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.set_active_organisation\(uuid\), public\.my_organisations\(\),\s*public\.grant_organisation_access\(uuid, uuid, text, timestamptz, text\), public\.revoke_organisation_access\(uuid\) TO authenticated;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_active_organisation\(uuid\), public\.my_organisations\(\),\s*public\.grant_organisation_access\(uuid, uuid, text, timestamptz, text\), public\.revoke_organisation_access\(uuid\) FROM PUBLIC, anon;/,
    );
  });

  it('grant refuses a self-grant unless the caller is platform staff', () => {
    expect(sql).toMatch(/IF p_user = auth\.uid\(\) AND NOT public\.is_tps_staff\(\) THEN/);
  });

  it('grant only offers a role marked consultancy_grantable, checked in the RPC itself', () => {
    expect(sql).toMatch(/access_roles WHERE key = p_role AND consultancy_grantable/);
  });

  it('grant requires a LIVE consultancy_client relationship, not merely any relationship row', () => {
    const grantFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.grant_organisation_access('),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.revoke_organisation_access('),
    );
    expect(grantFn).toMatch(/relationship_type = 'consultancy_client' AND status = 'active'/);
    expect(grantFn).toMatch(/valid_from <= current_date AND \(valid_until IS NULL OR valid_until >= current_date\)/);
  });

  it('ACCESS_SCOPES matches user_organisation_access.access_scope CHECK exactly', () => {
    const m = sql.match(/access_scope\s+text NOT NULL DEFAULT 'full' CHECK \(access_scope IN \(([^)]*)\)\)/);
    expect(m, 'access_scope CHECK not found').toBeTruthy();
    const values = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    expect(values.sort()).toEqual([...ACCESS_SCOPES].sort());
  });

  it('the read policy lets a consultancy manager see only their OWN colleagues’ grants, never every grant', () => {
    expect(sql).toMatch(/has_capability\(\(SELECT public\.my_home_company_id\(\)\), 'consultancy\.manage_access'\)\s*\n\s*AND public\.is_home_colleague\(user_id\)/);
  });
});
