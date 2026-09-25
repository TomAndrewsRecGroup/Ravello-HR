import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 098: the decision log is staff-readable, insertable only as yourself,
// and a session may change nothing on a row but the outcome fields.

const sql = readFileSync(resolve(__dirname, '../../../../../supabase/migrations/098_jev_decisions.sql'), 'utf8');
const policies = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.jev_decisions([\s\S]*?);/g)].map(m => ({ name: m[1], body: m[2] }));

describe('jev_decisions (098)', () => {
  it('has RLS on and no open policy', () => {
    expect(sql).toMatch(/ALTER TABLE public\.jev_decisions ENABLE ROW LEVEL SECURITY/);
    expect(policies.map(p => p.name).sort()).toEqual(['jev_decisions_actor_insert', 'jev_decisions_actor_read', 'jev_decisions_outcome', 'jev_decisions_staff_read']);
    for (const p of policies) {
      expect(p.body, p.name).not.toMatch(/USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
      expect(p.body, p.name).toMatch(/TO authenticated/);
    }
  });
  it('a session may insert only as itself and read only its own or as staff', () => {
    expect(policies.find(p => p.name === 'jev_decisions_actor_insert')!.body).toMatch(/FOR INSERT TO authenticated WITH CHECK \(actor_id = \(SELECT auth\.uid\(\)\)\)/);
    expect(policies.find(p => p.name === 'jev_decisions_staff_read')!.body).toMatch(/FOR SELECT TO authenticated USING \(\(SELECT public\.is_tps_staff\(\)\)\)/);
  });
  it('the guard trigger keys on current_user and lets a session change only the outcome fields', () => {
    expect(sql).toMatch(/IF current_user IN \('authenticated', 'anon'\) THEN/);
    expect(sql).toMatch(/to_jsonb\(NEW\) - 'human_outcome' - 'acted' - 'acted_on' IS DISTINCT FROM to_jsonb\(OLD\) - 'human_outcome' - 'acted' - 'acted_on'/);
    expect(sql).toMatch(/CREATE TRIGGER jev_decisions_guard BEFORE UPDATE ON public\.jev_decisions/);
    expect(sql).toMatch(/REVOKE DELETE, TRUNCATE ON public\.jev_decisions FROM PUBLIC, anon, authenticated/);
  });
  it('the human outcome vocabulary is the one the outcome route accepts', () => {
    const route = readFileSync(resolve(__dirname, '../../../app/api/hs/jev/outcome/route.ts'), 'utf8');
    expect(sql).toMatch(/human_outcome IN \('accepted', 'overridden', 'ignored'\)/);
    expect(route).toMatch(/enumOf\(\['accepted', 'overridden', 'ignored'\]\)/);
  });
});
