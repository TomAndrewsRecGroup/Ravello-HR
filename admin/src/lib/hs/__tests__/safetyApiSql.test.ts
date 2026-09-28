import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migrations 126-129: the security properties of the functions the
// PROTECT screens call. Each was probed live (supabase/probes/126_*,
// 128_consultancy_safety, 128_volume); this pins the SQL so a later
// edit cannot quietly widen them.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const read = (f: string) => readFileSync(`${MIG}/${f}`, 'utf8');
const m126 = read('126_action_scope_safety_search.sql');
const m127 = read('127_safety_ui_helpers.sql');
const m128 = read('128_safety_overview_analysis.sql');
const m129 = read('129_safety_search_indexes.sql');

/** The header line of a function: from CREATE … to AS $$. */
function header(sql: string, fn: string): string {
  const i = sql.indexOf(`FUNCTION public.${fn}(`);
  if (i < 0) throw new Error(`${fn} not found`);
  return sql.slice(i, sql.indexOf('$$', i));
}
function body(sql: string, fn: string): string {
  const i = sql.indexOf(`FUNCTION public.${fn}(`);
  const a = sql.indexOf('$$', i) + 2;
  return sql.slice(a, sql.indexOf('$$', a));
}

describe('read functions run with the caller\'s own RLS', () => {
  it.each([
    [m127, 'my_capabilities'], [m128, 'hs_safety_overview'], [m128, 'hs_safety_breakdowns'], [m126, 'search_records'],
  ])('%#: is SECURITY INVOKER (never DEFINER)', (sql, fn) => {
    expect(header(sql, fn)).not.toMatch(/SECURITY DEFINER/);
  });

  it('the overview and analysis are scoped to the ACTIVE organisation only', () => {
    for (const fn of ['hs_safety_overview', 'hs_safety_breakdowns']) {
      const b = body(m128, fn);
      expect(b).toMatch(/public\.my_company_id\(\)/);
      expect(b).not.toMatch(/is_tps_staff|my_home_company_id/);
    }
  });

  it('search never matches descriptions, notes or sensitive detail', () => {
    const b = body(m126, 'search_records');
    expect(b).not.toMatch(/description ILIKE|notes ILIKE|summary ILIKE|injured|incident_person_sensitive|rationale ILIKE/);
  });
});

describe('org_directory (the people picker)', () => {
  const h = header(m127, 'org_directory');
  const b = body(m127, 'org_directory');
  it('returns id, name and whether the person is there by grant — nothing else', () => {
    expect(h).toMatch(/RETURNS TABLE \(user_id uuid, full_name text, via_grant boolean\)/);
    expect(b).not.toMatch(/p\.email\s*[,)]|p\.phone|p\.role\b/);
  });
  it('is limited to the caller\'s active organisation and live grants', () => {
    expect(b).toMatch(/public\.my_company_id\(\)/);
    expect(b).toMatch(/g\.active_status = 'active' AND g\.valid_from <= now\(\) AND \(g\.valid_until IS NULL OR g\.valid_until > now\(\)\)/);
    expect(b.match(/auth\.uid\(\) IS NOT NULL/g)?.length).toBe(2);
  });
});

describe('grants', () => {
  it.each([
    [m127, 'my_capabilities()'], [m127, 'org_directory()'],
    [m128, 'hs_safety_overview(uuid, uuid, date, date)'], [m128, 'hs_safety_breakdowns(uuid, date, date)'],
    [m126, 'action_party(uuid, uuid, uuid)'], [m126, 'search_records(text, integer)'],
  ])('%#: revoked from anon, granted to authenticated', (sql, sig) => {
    const esc = sig.replace(/[()]/g, '\\$&');
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon;`));
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO authenticated;`));
  });
});

describe('126: who may change an action', () => {
  it('the update policy admits assigners and the action\'s own parties only', () => {
    const p = m126.slice(m126.indexOf('CREATE POLICY client_actions_update'));
    expect(p.slice(0, p.indexOf(';'))).toMatch(/'actions\.assign'[\s\S]*action_party\(assigned_to, assigned_person_id, verifier_id\)/);
  });
  it('the party guard sorts BEFORE actions_lifecycle, so it sees the caller\'s row', () => {
    const name = /CREATE TRIGGER (\w+) BEFORE UPDATE ON public\.actions/.exec(m126)![1];
    expect(name < 'actions_lifecycle').toBe(true);
  });
  it('a party may touch only its own columns', () => {
    const g = body(m126, 'actions_party_guard');
    expect(g).toMatch(/ARRAY\['status','completion_evidence'\]/);
    expect(g).toMatch(/'verification_comments','verification_rejection_reason'/);
    expect(g).not.toMatch(/'title'|'due_date'|'assigned_to'|'verification_required'/);
  });
});

describe('129: every searched safety title is trigram-indexed', () => {
  const search = body(m126, 'search_records');
  it.each([
    ['hazards', 'title'], ['hs_incidents', 'title'], ['hs_incidents', 'incident_number'], ['actions', 'title'],
    ['risk_assessments', 'title'], ['method_statements', 'title'], ['coshh_assessments', 'title'], ['substances', 'product_name'],
  ])('%s.%s', (table, col) => {
    expect(m129).toMatch(new RegExp(`ON public\\.${table}\\s+USING gin \\(${col} extensions\\.gin_trgm_ops\\)`));
    expect(search).toMatch(new RegExp(`\\b${col} ILIKE pat`));
  });
});
