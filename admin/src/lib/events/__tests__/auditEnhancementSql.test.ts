import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Core-OS 360 Phase 5, Group 7 (migration 162): Internal Audit
// Enhancement, Governance Calendar, Worker Consultation, Environmental
// Complaints. Pins the invariants the task brief itself specifies —
// live-verified in supabase/probes/162_audit_enhancement_calendar_
// consultation.sql (18/18 passed).

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = readFileSync(`${MIG}/162_audit_enhancement_calendar_consultation.sql`, 'utf8');

describe('migration 162 (audit enhancement / consultation / complaints)', () => {
  it('audit_findings references hs_audit_responses, never a second audit engine', () => {
    expect(sql).toMatch(/hs_audit_response_id\s+uuid NOT NULL UNIQUE REFERENCES public\.hs_audit_responses\(id\)/);
  });

  it('audit_findings is mutable (no REVOKE UPDATE), unlike the insert-only hs_audit_responses it extends', () => {
    expect(sql).not.toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.audit_findings/);
  });

  it('the closure guard is severity-scoped: only major/critical requires root_cause + corrective_action + verified effectiveness', () => {
    const body = sql.slice(sql.indexOf('FUNCTION public.audit_findings_closure_guard'), sql.indexOf('REVOKE ALL ON FUNCTION public.audit_findings_closure_guard'));
    expect(body).toMatch(/IF NEW\.severity IN \('major', 'critical'\) THEN/);
    expect(body).toMatch(/root_cause IS NULL OR length\(btrim\(NEW\.root_cause\)\) = 0/);
    expect(body).toMatch(/corrective_action_id IS NULL/);
    expect(body).toMatch(/a\.status <> 'complete' OR a\.verified_at IS NULL OR a\.effectiveness_outcome <> 'effective'/);
  });

  it('reuses the EXISTING actions.verified_at/effectiveness_outcome columns — no parallel verification table', () => {
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.\w*verif\w*/i);
    expect(sql).toMatch(/SELECT status, verified_at, effectiveness_outcome INTO a\s+FROM public\.actions/);
  });

  it("a corrective action is source_type = 'audit_finding' — never a second action table", () => {
    expect(sql).toMatch(/'audit_finding'/);
    expect(sql).not.toMatch(/CREATE TABLE public\.audit_finding_actions/);
  });

  it('hs_submit_audit raises a finding for every FAILED response, idempotently via ON CONFLICT DO NOTHING', () => {
    const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.hs_submit_audit'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_submit_audit'));
    expect(body).toMatch(/IF r->>'rating' = 'fail' THEN/);
    expect(body).toMatch(/INSERT INTO public\.audit_findings \(hs_audit_response_id, audit_id, company_id, severity\)/);
    expect(body).toMatch(/ON CONFLICT \(hs_audit_response_id\) DO NOTHING/);
  });

  it('severity is derived from the template item default_severity, defaulting to minor — never guessed as major', () => {
    const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.hs_submit_audit'), sql.indexOf('REVOKE ALL ON FUNCTION public.hs_submit_audit'));
    expect(body).toMatch(/COALESCE\(v_item_sev, 'minor'\)/);
  });

  it('consultation_records and environmental_complaints assert same-organisation site and action links', () => {
    expect([...sql.matchAll(/PERFORM public\.assert_same_org\(NEW\.company_id, 'hs_sites', NEW\.site_id\);/g)]).toHaveLength(2);
    expect([...sql.matchAll(/PERFORM public\.assert_same_org\(NEW\.company_id, 'actions', NEW\.linked_action_id\);/g)]).toHaveLength(2);
  });

  it('write guards are applied to all four client-writable tables', () => {
    for (const t of ['audit_programmes', 'audit_findings', 'consultation_records', 'environmental_complaints']) {
      expect(sql).toMatch(new RegExp(`apply_write_guard\\('public\\.${t}'\\)`));
    }
  });

  it('RLS is enabled on all four new tables', () => {
    for (const t of ['audit_programmes', 'audit_findings', 'consultation_records', 'environmental_complaints']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  it('every new SECURITY DEFINER trigger function is revoked from PUBLIC, anon and authenticated', () => {
    const definers = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)AS \$\$/g)]
      .filter(m => /SECURITY DEFINER/.test(m[2])).map(m => m[1]);
    const stampAndGuardFns = definers.filter(f => /_stamp$|_fill$|_closure_guard$/.test(f));
    expect(stampAndGuardFns.length).toBeGreaterThan(0);
    for (const f of stampAndGuardFns) {
      expect(sql, f).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\(\\) FROM PUBLIC, anon, authenticated`));
    }
  });

  it('audit_findings/consultation_records/environmental_complaints outbox whitelists never carry free text', () => {
    const FORBIDDEN = /^(description|root_cause|outcome|outcome_summary|topic|notes)$/;
    const triggers = [...sql.matchAll(/CREATE TRIGGER (\w+)_platform_event AFTER ([A-Z OR]+) ON public\.(\w+)\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\(([^)]*)\)/g)]
      .map(m => ({ table: m[3], cols: m[4].split(',').map(c => c.trim().replace(/^'|'$/g, '')) }));
    expect(triggers.length).toBe(3);
    for (const t of triggers) for (const c of t.cols) expect(c, `${t.table} whitelists ${c}`).not.toMatch(FORBIDDEN);
  });

  it("permit_conditions-style non-verdict discipline: severity vocabulary is exactly minor/major/critical", () => {
    expect(sql).toMatch(/severity\s+text NOT NULL DEFAULT 'minor' CHECK \(severity IN \('minor', 'major', 'critical'\)\)/);
  });
});
