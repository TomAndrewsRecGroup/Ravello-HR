import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — Development
// Plans preservation test, slice 2: the live RLS/schema shape.
//
// Two facts this pins, both named by the manual regression script
// (docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md) and checked against
// the LIVE database (via pg_policies) before writing this, per this
// codebase's own standing rule that a .sql file on disk is a record
// of intent, not proof of what the database contains:
//
//   1. A client user can read their own company's plan and CANNOT
//      read another company's — dev_plans_client_select scopes on
//      company_id = my_company_id(), redefined by migration 117 (the
//      live definition; 066's original used a profiles subquery that
//      117 superseded — resolved the same "latest definition wins"
//      way platformEventsSql.test.ts/hsSqlShape.test.ts already
//      require for every table with more than one defining file).
//   2. The "athlete" and "employee" use cases the manual script names
//      don't cross-contaminate, because there is only ONE column
//      (athlete_id, nullable) distinguishing them — there is no
//      separate employee_id/employee plan concept in the schema at
//      all, so there is no second identity a plan's content could
//      leak into.

const MIG = resolve(__dirname, '../../../../supabase/migrations');
const FILES = ['066_dev_plans.sql', '067_dev_plan_extras_and_athlete_phone.sql', '076_dev_plan_content_and_strengths.sql', '117_core_tenancy.sql'];
const sql = FILES.map(f => readFileSync(`${MIG}/${f}`, 'utf8')).join('\n');

type Policy = { name: string; table: string; body: string };

function resolvePolicies(text: string): Policy[] {
  const live = new Map<string, Policy>();
  const tokens = [...text.matchAll(/DROP POLICY IF EXISTS (\w+)\s+ON (?:public\.)?[\w.]+;|CREATE POLICY (\w+) ON (?:public\.)?([\w.]+)([\s\S]*?);/g)];
  for (const m of tokens) {
    if (m[1]) { live.delete(m[1]); continue; } // DROP POLICY
    live.set(m[2], { name: m[2], table: m[3].replace(/^public\./, ''), body: m[4] });
  }
  return [...live.values()];
}

const policies = resolvePolicies(sql);
const byName = (name: string) => policies.find(p => p.name === name);

describe('dev_plans — live RLS shape (066 + 117)', () => {
  it('scopes the client SELECT policy to the caller\'s own company via my_company_id(), not the superseded profiles subquery', () => {
    const pol = byName('dev_plans_client_select');
    expect(pol).toBeTruthy();
    expect(pol!.table).toBe('dev_plans');
    expect(pol!.body).toMatch(/company_id\s*=\s*\(SELECT public\.my_company_id\(\)\)/);
    // The 066 original scoped via a profiles subquery — confirm that
    // shape is gone from the LIVE (117-resolved) definition, not just
    // that the new one exists alongside it.
    expect(pol!.body).not.toMatch(/company_id IN \(SELECT company_id FROM profiles/);
  });

  it('restricts the client SELECT policy to active/completed plans — a draft is never client-visible', () => {
    const pol = byName('dev_plans_client_select');
    expect(pol!.body).toMatch(/status = ANY \(ARRAY\['active'::dev_plan_status, 'completed'::dev_plan_status\]\)/);
  });

  it('dev_plan_milestones inherits the same company + status scoping from its parent plan, via 117\'s live definition', () => {
    const pol = byName('dev_plan_milestones_client_select');
    expect(pol).toBeTruthy();
    expect(pol!.body).toMatch(/dev_plans\.company_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(pol!.body).toMatch(/dev_plans\.status = ANY/);
  });

  it('staff hold an unrestricted ALL policy on dev_plans', () => {
    expect(sql).toMatch(/CREATE POLICY dev_plans_staff_all ON dev_plans\s+FOR ALL[\s\S]*?is_tps_staff\(\)/);
  });

  it('RLS is enabled on dev_plans and dev_plan_milestones', () => {
    expect(sql).toMatch(/ALTER TABLE dev_plans\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE dev_plan_milestones\s+ENABLE ROW LEVEL SECURITY/);
  });
});

describe('dev_plans — the two use cases share one nullable column, never a second identity', () => {
  it('has athlete_id, nullable, ON DELETE SET NULL — never NOT NULL', () => {
    expect(sql).toMatch(/athlete_id\s+UUID REFERENCES athletes\(id\) ON DELETE SET NULL/);
  });

  it('has no employee_id column or FK anywhere in these migrations', () => {
    expect(sql).not.toMatch(/\bemployee_id\b/);
  });

  it('company_id is the only scoping identity, NOT NULL, cascading with the company', () => {
    expect(sql).toMatch(/company_id\s+UUID NOT NULL REFERENCES companies\(id\) ON DELETE CASCADE/);
  });
});

describe('dev_plans — content columns round-trip via JSONB, never truncated by a column type', () => {
  it('content and strengths are JSONB, defaulting to empty rather than NULL', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS content\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS strengths\s+JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it('training_items and roles_items are JSONB arrays, defaulting to empty', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS training_items\s+JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS roles_items\s+JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });
});
