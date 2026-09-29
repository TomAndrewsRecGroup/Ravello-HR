// Pins migration 177 (Core-OS 360 Phase 8, Group 1: Risk Graph
// foundation). The live database is the real check
// (supabase/probes/177_risk_graph_foundation.sql, all checks pass —
// including RLS/SECURITY INVOKER behaviour a text-only test cannot
// exercise); this stops the migration file drifting from what was
// applied and pins the properties a text scan CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/177_risk_graph_foundation.sql'), 'utf8');

describe('Risk Graph foundation (177)', () => {
  it('hs_entity_table() gains exactly the four new branches, every prior branch untouched', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.hs_entity_table');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    for (const [key, table] of [
      ["'permit'", 'permits'],
      ["'isolation'", 'isolations'],
      ["'emergency_plan'", 'emergency_plans'],
      ["'management_review'", 'management_reviews'],
      // Spot-check a handful of pre-existing branches survive unchanged.
      ["'hazard'", 'hazards'],
      ["'risk_assessment'", 'risk_assessments'],
      ["'action'", 'actions'],
      ["'legal_obligation'", 'organisation_legal_obligations'],
      ["'visit_observation'", 'visit_observations'],
    ]) {
      expect(body, key).toMatch(new RegExp(`WHEN ${key}\\s+THEN '${table}'`));
    }
  });

  it('risk_graph_neighbors() is SECURITY INVOKER, never DEFINER — it must run as the caller so RLS on hs_links applies', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.risk_graph_neighbors');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });

  it('risk_graph_neighbors() hard-caps depth at 3 and rows at 500 regardless of the caller\'s p_depth', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.risk_graph_neighbors');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).toMatch(/LEAST\(GREATEST\(p_depth, 1\), 3\)/);
    expect(body).toMatch(/LIMIT 500/);
  });

  it('grants EXECUTE to authenticated only, matching search_records()\'s own precedent — never anon or PUBLIC', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.risk_graph_neighbors\(text, uuid, integer\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.risk_graph_neighbors\(text, uuid, integer\) TO authenticated;/);
  });

  it('excludes self (hop 0) from its own result set and walks hs_links in both directions', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.risk_graph_neighbors');
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    expect(body).toMatch(/WHERE hop > 0/);
    expect(body).toMatch(/'outgoing'/);
    expect(body).toMatch(/'incoming'/);
  });

  it('adds no new table, trigger, RLS policy, or DEFINER function — this is purely additive to two existing functions', () => {
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/CREATE TRIGGER/);
    expect(sql).not.toMatch(/CREATE POLICY/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
  });
});
