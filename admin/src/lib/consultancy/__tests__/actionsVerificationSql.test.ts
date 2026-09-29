// Pins migration 175 (Core-OS 360 Phase 7, Group 4: portfolio-wide
// access to the universal Actions table). The live database is the
// real check
// (supabase/probes/175_consultancy_actions_verification.sql, 6/6
// pass); this stops the migration file drifting from what was applied.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/175_consultancy_actions_verification.sql'), 'utf8');

describe('Consultancy access to actions (175)', () => {
  it('adds three new, additive policies — never modifying the three pre-existing single-tenant ones', () => {
    expect(sql).toMatch(/CREATE POLICY actions_consultancy_select ON public\.actions FOR SELECT TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY actions_consultancy_insert ON public\.actions FOR INSERT TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY actions_consultancy_update ON public\.actions FOR UPDATE TO authenticated/);
    expect(sql).not.toMatch(/DROP POLICY/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/);
  });

  it('every new policy is gated on consultancy.service_manage against the row\'s own company_id, never my_company_id()', () => {
    for (const name of ['actions_consultancy_select', 'actions_consultancy_insert', 'actions_consultancy_update']) {
      const start = sql.indexOf(`CREATE POLICY ${name}`);
      const body = sql.slice(start, sql.indexOf(';', start) + 1);
      expect(body, name).toMatch(/has_capability\(company_id, 'consultancy\.service_manage'\)/);
      expect(body, name).not.toMatch(/my_company_id\(\)/);
    }
  });

  it('no new trigger or function — relies entirely on the pre-existing actions_lifecycle()/actions_party_guard()', () => {
    expect(sql).not.toMatch(/CREATE TRIGGER/);
    expect(sql).not.toMatch(/CREATE FUNCTION/);
  });
});
