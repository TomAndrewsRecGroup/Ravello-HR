// Pins migration 159 (Core-OS 360 Phase 5, Group 4: the Legal
// Register). The live database is the real check
// (supabase/probes/159_legal_register.sql, 17/17 PASS); this stops the
// migration file drifting from what was applied and pins the
// properties that, if lost, would silently reopen a hole or let AI
// decide an applicability call, or widen the cautious compliance
// vocabulary.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/159_legal_register.sql'), 'utf8');

const NEW_TABLES = ['legal_requirements', 'organisation_legal_obligations', 'compliance_evaluations', 'legal_requirement_research_notes'];
const CLIENT_READABLE = ['organisation_legal_obligations', 'compliance_evaluations'];
const STAFF_ONLY = ['legal_requirements', 'legal_requirement_research_notes'];

describe('the Legal Register (159)', () => {
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

  it('legal_requirements and legal_requirement_research_notes are staff-only — no client SELECT policy at all', () => {
    for (const t of STAFF_ONLY) {
      expect(sql, t).not.toMatch(new RegExp(`CREATE POLICY ${t}_read`));
      expect(sql, t).not.toMatch(new RegExp(`CREATE POLICY ${t}_(insert|update|delete)`));
    }
  });

  it('organisation_legal_obligations/compliance_evaluations are client-READ + staff-MANAGE only — no client write path', () => {
    for (const t of CLIENT_READABLE) {
      expect(sql, t).toMatch(new RegExp(`CREATE POLICY ${t}_read ON public\\.${t} FOR SELECT TO authenticated\\s+USING \\(company_id = \\(SELECT public\\.my_company_id\\(\\)\\)`));
      expect(sql, t).not.toMatch(new RegExp(`CREATE POLICY ${t}_(insert|update|delete)`));
    }
  });

  it('every client-readable table calls apply_write_guard(), the staff-only reference tables do not', () => {
    for (const t of CLIENT_READABLE) {
      expect(sql, t).toMatch(new RegExp(`apply_write_guard\\('public\\.${t}'\\)`));
    }
    for (const t of STAFF_ONLY) {
      expect(sql, t).not.toMatch(new RegExp(`apply_write_guard\\('public\\.${t}'\\)`));
    }
  });

  it('rule 1: an applicability decision needs a named, timestamped assessor before it may be applicable/not_applicable', () => {
    const fn = sql.slice(
      sql.indexOf('FUNCTION public.organisation_legal_obligations_stamp'),
      sql.indexOf('$$;', sql.indexOf('FUNCTION public.organisation_legal_obligations_stamp')));
    expect(fn).toMatch(/applicability_status IN \('applicable', 'not_applicable'\)/);
    expect(fn).toMatch(/assessed_by IS NULL OR NEW\.assessed_at IS NULL/);
    expect(fn).toMatch(/RAISE EXCEPTION/);
    // Never auto-stamps assessed_by from auth.uid() — WHO made the
    // applicability call is itself part of the recorded decision, not
    // bookkeeping the trigger may spoof.
    expect(fn).not.toMatch(/NEW\.assessed_by := auth\.uid\(\)/);
  });

  it('rule 2: compliance_evaluations.status is EXACTLY the six-value cautious vocabulary', () => {
    expect(sql).toMatch(/status\s+text NOT NULL CHECK \(status IN \(\s*'evidence_current', 'evidence_incomplete', 'review_due',\s*'potential_noncompliance', 'confirmed_noncompliance', 'not_evaluated'\)\)/);
  });

  it('company_id on compliance_evaluations is derived from the obligation, never trusted from the caller', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.compliance_evaluations_fill'), sql.indexOf('$$;', sql.indexOf('FUNCTION public.compliance_evaluations_fill')));
    expect(fn).toMatch(/SELECT company_id INTO o FROM public\.organisation_legal_obligations WHERE id = NEW\.obligation_id/);
    expect(fn).toMatch(/NEW\.company_id := o\.company_id/);
  });

  it('compliance_evaluations is insert-only — no UPDATE/DELETE/TRUNCATE grant to any session', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.compliance_evaluations FROM PUBLIC, anon, authenticated/);
  });

  it('rule 6: the roll-forward trigger only advances next_review_due when this is the NEWEST evaluation for the obligation', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.compliance_evaluations_roll'), sql.indexOf('$$;', sql.indexOf('FUNCTION public.compliance_evaluations_roll')));
    expect(fn).toMatch(/NOT EXISTS/);
    expect(fn).toMatch(/ce2\.evaluated_at > NEW\.evaluated_at/);
  });

  it('rule 5: no ALTER to actions_source_type_check — legal_requirement already allowed since Phase 4', () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.actions/);
  });

  it('rule 9: evidence gains a compliance_evaluation branch on all four evidence functions, gated on risk.read/risk.create', () => {
    for (const fn of ['hs_entity_table', 'hs_scope_for_entity']) {
      expect(sql, fn).toMatch(new RegExp(`FUNCTION public\\.${fn}\\(`));
    }
    expect(sql).toMatch(/WHEN 'compliance_evaluation'\s+THEN 'compliance_evaluations'/);
    expect(sql).toMatch(/WHEN 'compliance_evaluation'\s+THEN 'register'/);
    expect(sql).toMatch(/WHEN p_entity_type = 'compliance_evaluation' THEN\s*\n\s*public\.has_capability\(p_company, 'risk\.read'\)/);
    expect(sql).toMatch(/WHEN p_entity_type = 'compliance_evaluation' THEN false/);
  });

  it('no SECURITY DEFINER function this migration adds is executable by anon or authenticated', () => {
    for (const fn of ['legal_requirements_stamp', 'organisation_legal_obligations_stamp', 'compliance_evaluations_fill', 'compliance_evaluations_roll', 'legal_requirement_research_notes_fill']) {
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('the outbox never whitelists free text — notes/assessment_rationale/raw_result_summary/action_taken', () => {
    const FORBIDDEN = /^(notes|assessment_rationale|raw_result_summary|action_taken|summary|query_used)$/;
    const triggers = [...sql.matchAll(/EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/g)];
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    for (const t of triggers) {
      const cols = [...t[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
      for (const c of cols) expect(c, t[1]).not.toMatch(FORBIDDEN);
    }
  });

  it('audit_row never whitelists free text', () => {
    const FORBIDDEN = /^(notes|assessment_rationale|raw_result_summary|action_taken|summary|title)$/;
    const triggers = [...sql.matchAll(/EXECUTE FUNCTION public\.audit_row\(([^)]*)\)/g)];
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    for (const t of triggers) {
      const cols = [...t[1].matchAll(/'([^']+)'/g)].map(x => x[1]).slice(2);
      for (const c of cols) expect(c, t[1]).not.toMatch(FORBIDDEN);
    }
  });

  it('carries no compliance-verdict language anywhere in this file (the table/column names themselves aside)', () => {
    const withoutComments = sql.replace(/--.*$/gm, '');
    expect(withoutComments.toLowerCase()).not.toMatch(/is (legally )?compliant\b/);
    expect(withoutComments.toLowerCase()).not.toMatch(/'compliant'|'non_compliant'/);
  });

  it('the Tavily research-notes table is inert storage only — no http/fetch call, no API key reference', () => {
    expect(sql.toLowerCase()).not.toMatch(/tavily_api_key|fetch\(|http:\/\/|https:\/\//);
    expect(sql).toMatch(/source\s+text NOT NULL CHECK \(source IN \('tavily', 'manual'\)\)/);
  });
});
