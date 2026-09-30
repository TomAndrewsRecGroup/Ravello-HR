// Pins migration 187 (Core-OS 360 Completion Programme, Phase 23,
// Group 2: portfolio-safe consultant Risk Graph view, closing
// gap-ledger row C8.5). The live database is the real check
// (supabase/probes/187_risk_graph_portfolio_read.sql, all 8 checks
// pass — including a real cross-tenant round trip a text-only test
// cannot exercise); this stops the migration file drifting from what
// was applied and pins the properties a text scan CAN verify.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/187_risk_graph_portfolio_read.sql'), 'utf8');

const TABLES = [
  'hazards',
  'risk_assessments',
  'risk_assessment_items',
  'risk_item_controls',
  'organisation_legal_obligations',
  'hs_links',
] as const;

describe('Risk Graph portfolio-safe consultant read (187)', () => {
  it('adds exactly six consultancy-read policies, one per table this group targets', () => {
    for (const table of TABLES) {
      expect(sql, table).toMatch(
        new RegExp(`CREATE POLICY ${table}_consultancy_select ON public\\.${table} FOR SELECT TO authenticated`),
      );
    }
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(TABLES.length);
  });

  it('every new policy is gated on has_capability(company_id, \'consultancy.service_manage\') — the Phase 6/7 portfolio-wide precedent, never my_company_id()', () => {
    for (const table of TABLES) {
      const start = sql.indexOf(`CREATE POLICY ${table}_consultancy_select`);
      const stmt = sql.slice(start, sql.indexOf(';', start) + 1);
      expect(stmt, table).toMatch(/USING \(\(SELECT public\.has_capability\(company_id, 'consultancy\.service_manage'\)\)\)/);
      expect(stmt, table).not.toMatch(/my_company_id\(\)/);
    }
  });

  it('is SELECT-only — no WITH CHECK, no FOR ALL, no FOR INSERT/UPDATE/DELETE anywhere in this migration', () => {
    expect(sql).not.toMatch(/WITH CHECK/);
    expect(sql).not.toMatch(/FOR ALL/);
    expect(sql).not.toMatch(/FOR INSERT/);
    expect(sql).not.toMatch(/FOR UPDATE/);
    expect(sql).not.toMatch(/FOR DELETE/);
  });

  it('adds no new table, trigger, function, or DEFINER anything — purely additive RLS policies', () => {
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/CREATE TRIGGER/);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
  });

  it('never drops or alters an existing policy — additive only, since RLS ORs permissive policies', () => {
    expect(sql).not.toMatch(/DROP POLICY/);
    expect(sql).not.toMatch(/ALTER POLICY/);
  });
});
