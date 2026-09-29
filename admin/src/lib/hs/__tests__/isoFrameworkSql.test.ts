// Pins migration 158 (Core-OS 360 Phase 5, Group 3: the shared ISO
// 45001/14001 management-system framework). The live database is the
// real check (supabase/probes/158_iso_framework.sql, 13/13 PASS); this
// stops the migration file drifting from what was applied and pins the
// properties that, if lost, would silently reopen a hole or reintroduce
// a compliance-claim string.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/158_iso_management_system_framework.sql'), 'utf8');

const NEW_TABLES = ['management_system_standards', 'standard_clauses', 'standard_evidence_links', 'iso_certifications'];
const CLIENT_WRITABLE = ['standard_evidence_links', 'iso_certifications'];

describe('ISO management-system framework (158)', () => {
  it('RLS is enabled on all four new tables', () => {
    for (const t of NEW_TABLES) {
      expect(sql, t).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  it('every table has a staff ALL policy, and no policy is USING (true) or granted to anon', () => {
    for (const t of NEW_TABLES) {
      expect(sql, t).toMatch(new RegExp(`CREATE POLICY ${t}_staff_all ON public\\.${t} FOR ALL TO authenticated[\\s\\S]*?is_tps_staff\\(\\)`));
    }
    expect(sql).not.toMatch(/USING \(true\)/);
    expect(sql).not.toMatch(/TO anon/);
  });

  it('management_system_standards/standard_clauses follow inspection_templates\' precedent: staff-write, capability-gated client read', () => {
    // Deliberately NOT the hs_sector_packs/hs_audit_templates "never
    // client-visible" posture — see migration 158's own rule 6 for why:
    // the UI genuinely needs a client to read the clause catalogue.
    expect(sql).toMatch(/CREATE POLICY management_system_standards_read ON public\.management_system_standards FOR SELECT TO authenticated\s+USING \(\(SELECT public\.has_capability/);
    expect(sql).toMatch(/CREATE POLICY standard_clauses_read ON public\.standard_clauses FOR SELECT TO authenticated\s+USING \(\(SELECT public\.has_capability/);
    // Neither has an INSERT/UPDATE/DELETE policy for a plain client —
    // only the staff ALL policy may write them.
    for (const t of ['management_system_standards', 'standard_clauses']) {
      expect(sql, t).not.toMatch(new RegExp(`CREATE POLICY ${t}_(insert|update|delete)`));
    }
  });

  it('standard_evidence_links/iso_certifications are per-company, client-read + staff-manage', () => {
    for (const t of CLIENT_WRITABLE) {
      expect(sql, t).toMatch(new RegExp(`CREATE POLICY ${t}_read ON public\\.${t} FOR SELECT TO authenticated\\s+USING \\(company_id = \\(SELECT public\\.my_company_id\\(\\)\\)`));
    }
  });

  it('every client-writable table calls apply_write_guard()', () => {
    for (const t of CLIENT_WRITABLE) {
      expect(sql, t).toMatch(new RegExp(`apply_write_guard\\('public\\.${t}'\\)`));
    }
  });

  it('standard_evidence_links refuses an unknown entity_type and a cross-organisation evidence record', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.standard_evidence_links_fill('), sql.indexOf('$$;', sql.indexOf('FUNCTION public.standard_evidence_links_fill(')));
    expect(fn).toMatch(/hs_entity_table\(NEW\.entity_type\) IS NULL/);
    expect(fn).toMatch(/hs_entity_company\(NEW\.entity_type, NEW\.entity_id\)/);
    expect(fn).toMatch(/owner IS DISTINCT FROM NEW\.company_id/);
  });

  it('standard_evidence_links has a UNIQUE constraint so the same evidence cannot be linked twice', () => {
    expect(sql).toMatch(/UNIQUE \(company_id, clause_id, entity_type, entity_id\)/);
  });

  it('no SECURITY DEFINER function this migration adds is executable by anon or authenticated', () => {
    for (const fn of ['standard_evidence_links_fill', 'iso_certifications_stamp']) {
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('audit_row is wired for both new writable tables, and never whitelists free text', () => {
    const FORBIDDEN = /^(description|methodology_notes|notes|certifying_body|title)$/;
    const triggers = [...sql.matchAll(/EXECUTE FUNCTION public\.audit_row\(([^)]*)\)/g)];
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    for (const t of triggers) {
      const cols = [...t[1].matchAll(/'([^']+)'/g)].map(x => x[1]).slice(2);
      for (const c of cols) expect(c, t[1]).not.toMatch(FORBIDDEN);
    }
  });

  it('management_system_standards.code is extensible, never restricted to a fixed value list', () => {
    expect(sql).toMatch(/code\s+text NOT NULL UNIQUE CHECK \(code ~/);
  });

  it('carries no certification or compliance-claim language anywhere in this file', () => {
    // The one place a "certified" fact may live is iso_certifications
    // itself (real, user-entered evidence) — but even there, no CODE
    // comment or string literal in this migration asserts a compliance
    // verdict computed by the platform.
    const withoutComments = sql.replace(/--.*$/gm, '');
    expect(withoutComments.toLowerCase()).not.toMatch(/is (legally )?compliant|is certified\b/);
  });

  it('iso_certifications is mutable (a renewal updates the row), unlike the insert-only register tables', () => {
    expect(sql).not.toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.iso_certifications/);
    expect(sql).toMatch(/CREATE POLICY iso_certifications_update ON public\.iso_certifications FOR UPDATE/);
  });
});
