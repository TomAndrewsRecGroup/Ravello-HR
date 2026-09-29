// Pins migration 163 (Core-OS 360 Phase 5, Group 8: the evidence-link
// foundation for the Legal Register / Objectives / Audit Findings, and
// search_records coverage for the Phase 5 tables). The live database is
// the real check (supabase/probes/163_evidence_link_foundation.sql,
// 10/10 pass); this stops the migration file drifting from what was
// applied and pins the properties that, if lost, would silently reopen
// a cross-organisation hole or a staff-only leak through search.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/163_evidence_link_foundation.sql'), 'utf8');

describe('Evidence-link foundation (163)', () => {
  it('RLS is enabled on requirement_evidence_links', () => {
    expect(sql).toMatch(/ALTER TABLE public\.requirement_evidence_links\s+ENABLE ROW LEVEL SECURITY/);
  });

  it('has a staff ALL policy, and no policy is USING (true) or granted to anon', () => {
    expect(sql).toMatch(/CREATE POLICY requirement_evidence_links_staff_all ON public\.requirement_evidence_links FOR ALL TO authenticated[\s\S]*?is_tps_staff\(\)/);
    expect(sql).not.toMatch(/USING \(true\)/);
    expect(sql).not.toMatch(/TO anon/);
  });

  it('is per-company, client-read + client-insert + client-delete, and has NO update policy — a wrong link is removed, not edited', () => {
    expect(sql).toMatch(/CREATE POLICY requirement_evidence_links_read ON public\.requirement_evidence_links FOR SELECT TO authenticated\s+USING \(company_id = \(SELECT public\.my_company_id\(\)\)/);
    expect(sql).toMatch(/CREATE POLICY requirement_evidence_links_insert ON public\.requirement_evidence_links FOR INSERT TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY requirement_evidence_links_delete ON public\.requirement_evidence_links FOR DELETE TO authenticated/);
    expect(sql).not.toMatch(/CREATE POLICY requirement_evidence_links_update/);
  });

  it('calls apply_write_guard()', () => {
    expect(sql).toMatch(/apply_write_guard\('public\.requirement_evidence_links'\)/);
  });

  it('source_type is a small, closed vocabulary — never "any entity can be a source"', () => {
    expect(sql).toMatch(/source_type\s+text NOT NULL CHECK \(source_type IN \('legal_obligation', 'objective', 'audit_finding'\)\)/);
  });

  it('validates BOTH the source and the evidence side against the same organisation', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.requirement_evidence_links_fill('), sql.indexOf('$$;', sql.indexOf('FUNCTION public.requirement_evidence_links_fill(')));
    expect(fn).toMatch(/hs_entity_table\(NEW\.source_type\) IS NULL/);
    expect(fn).toMatch(/hs_entity_table\(NEW\.entity_type\) IS NULL/);
    expect(fn).toMatch(/src_owner := public\.hs_entity_company\(NEW\.source_type, NEW\.source_id\)/);
    expect(fn).toMatch(/src_owner IS DISTINCT FROM NEW\.company_id/);
    expect(fn).toMatch(/ev_owner := public\.hs_entity_company\(NEW\.entity_type, NEW\.entity_id\)/);
    expect(fn).toMatch(/ev_owner IS DISTINCT FROM NEW\.company_id/);
  });

  it('has a UNIQUE constraint so the same requirement/evidence pair cannot be linked twice', () => {
    expect(sql).toMatch(/UNIQUE \(company_id, source_type, source_id, entity_type, entity_id\)/);
  });

  it('no SECURITY DEFINER function this migration adds is executable by anon or authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.requirement_evidence_links_fill\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('audit_row is wired, and never whitelists free text', () => {
    const FORBIDDEN = /^(description|notes|rationale)$/;
    const triggers = [...sql.matchAll(/EXECUTE FUNCTION public\.audit_row\(([^)]*)\)/g)];
    expect(triggers.length).toBeGreaterThanOrEqual(1);
    for (const t of triggers) {
      const cols = [...t[1].matchAll(/'([^']+)'/g)].map(x => x[1]).slice(2);
      for (const c of cols) expect(c, t[1]).not.toMatch(FORBIDDEN);
    }
  });

  it('hs_entity_table gains legal_obligation and objective, and every prior branch is copied unchanged', () => {
    expect(sql).toMatch(/WHEN 'legal_obligation'\s+THEN 'organisation_legal_obligations'/);
    expect(sql).toMatch(/WHEN 'objective'\s+THEN 'objectives'/);
    // Spot-check a handful of pre-existing branches from earlier groups
    // are still present, proving this is additive, not a rewrite.
    for (const [from, to] of [
      ['hazard', 'hazards'], ['contractor', 'contractors'], ['audit_finding', 'audit_findings'],
      ['environmental_permit', 'environmental_permits'], ['compliance_item', 'compliance_items'],
    ]) {
      expect(sql, from).toMatch(new RegExp(`WHEN '${from}'\\s+THEN '${to}'`));
    }
  });

  it('search_records stays SECURITY INVOKER (no SECURITY DEFINER clause) and REVOKEs anon', () => {
    const fn = sql.slice(sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.search_records('), sql.lastIndexOf('END $$;') + 'END $$;'.length);
    expect(fn).not.toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.search_records\(text, integer\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.search_records\(text, integer\) TO authenticated/);
  });

  it('search_records gains the seven Phase 5 branches, and every pre-existing branch is still present', () => {
    for (const t of [
      'environmental_aspect', 'environmental_permit', 'legal_requirement', 'objective',
      'management_review', 'audit_programme', 'consultation_record', 'iso_certification',
    ]) {
      expect(sql, t).toMatch(new RegExp(`SELECT '${t}',`));
    }
    // Pre-existing branches from 119/126/137 must still be there.
    for (const t of ['organisation', 'person', 'candidate', 'incident', 'hazard', 'audit', 'equipment']) {
      expect(sql, t).toMatch(new RegExp(`SELECT '${t}'`));
    }
  });

  it('never searches audit_findings.root_cause or environmental_complaints.description — free-text narrative stays out of a search title', () => {
    const fn = sql.slice(sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.search_records('), sql.lastIndexOf('END $$;') + 'END $$;'.length);
    expect(fn).not.toMatch(/root_cause/);
    expect(fn).not.toMatch(/environmental_complaints/);
    expect(fn).not.toMatch(/audit_findings/);
  });
});
