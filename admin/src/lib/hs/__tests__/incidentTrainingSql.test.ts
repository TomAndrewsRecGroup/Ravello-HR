import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 130 (incident → training, spec 59). The live probe
// (supabase/probes/130_incident_training.sql) proves the behaviour; this
// pins the properties that make it safe, so a later edit cannot quietly
// widen them.
const sql = readFileSync(resolve(__dirname, '../../../../../supabase/migrations/130_incident_training_link.sql'), 'utf8');
const fn = (name: string) => {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  if (!m) throw new Error(`function ${name} not found`);
  return m[0];
};

describe('130 incident_training_checks', () => {
  it('has RLS on and ONE policy: a read gated on incident.read (or staff)', () => {
    expect(sql).toMatch(/ALTER TABLE public\.incident_training_checks ENABLE ROW LEVEL SECURITY/);
    const policies = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.incident_training_checks FOR (\w+)/g)];
    expect(policies.map(p => [p[1], p[2]])).toEqual([['incident_training_checks_read', 'SELECT']]);
    expect(sql).toMatch(/has_capability\(\(SELECT public\.my_company_id\(\)\), 'incident\.read'\)/);
  });

  it('sessions cannot write it directly — the finding is computed by the database', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.incident_training_checks FROM anon, authenticated/);
  });

  it('is audited, and the audit whitelist carries no note or reason text', () => {
    const trig = sql.match(/audit_row\('incident_training_check'[^;]*\);/)![0];
    expect(trig).not.toMatch(/'note'|'withdrawn_reason'/);
  });

  it('keeps one live check per person per course, and withdrawal never deletes', () => {
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*?incident_training_checks \(incident_person_id, lower\(btrim\(course_name\)\)\) WHERE withdrawn_at IS NULL/);
    expect(fn('withdraw_incident_training_check')).not.toMatch(/DELETE/);
  });
});

describe('130 functions', () => {
  it('evidence is only for investigators/approvers acting in the incident\'s own organisation', () => {
    const f = fn('incident_training_evidence');
    expect(f).toMatch(/co IS DISTINCT FROM public\.my_company_id\(\)/);
    expect(f).toMatch(/has_capability\(co, 'incident\.investigate'\) OR public\.has_capability\(co, 'incident\.approve'\)/);
    expect(f).toMatch(/ERRCODE = '42501'/);
    expect(f).toMatch(/ip\.incident_id = p_incident/);  // only the people on THIS incident
    expect(f).not.toMatch(/notes/);                        // course facts only
  });

  it('both writers pass one gate: same organisation, investigator, writable session, open incident', () => {
    const g = fn('hs_training_check_gate');
    expect(g).toMatch(/co IS DISTINCT FROM public\.my_company_id\(\)/);
    expect(g).toMatch(/has_capability\(co, 'incident\.investigate'\)/);
    expect(g).toMatch(/session_can_write\(\)/);            // DEFINER bypasses the restrictive write guard
    expect(g).toMatch(/st IN \('closed','archived'\)/);
    expect(fn('record_incident_training_check')).toMatch(/hs_training_check_gate\(ip\.incident_id\)/);
    expect(fn('withdraw_incident_training_check')).toMatch(/hs_training_check_gate\(c\.incident_id\)/);
  });

  it('never writes a cause, a category or the incident itself', () => {
    for (const name of ['record_incident_training_check', 'withdraw_incident_training_check', 'incident_training_evidence']) {
      expect(fn(name)).not.toMatch(/incident_causes|UPDATE hs_incidents|INSERT INTO hs_incidents/);
    }
  });

  it('the timeline line never names the person', () => {
    const f = fn('record_incident_training_check');
    const log = f.match(/hs_log\([^;]*\);/)![0];
    expect(log).not.toMatch(/full_name|external_name|person/);
  });

  it('the DEFINER functions are not executable by anon, and the gate by nobody', () => {
    for (const name of ['incident_training_evidence', 'record_incident_training_check', 'withdraw_incident_training_check']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`));
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.hs_training_check_gate\(uuid\) FROM PUBLIC, anon, authenticated;/);
  });

  it('one status rule, used by both readers and the writer', () => {
    expect(fn('incident_training_evidence')).toMatch(/hs_training_status_at\(/);
    expect(fn('record_incident_training_check')).toMatch(/hs_training_status_at\(/);
  });
});
