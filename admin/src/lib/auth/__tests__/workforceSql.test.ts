import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Safe to Deploy (136) and workforce integration (137): the properties
// the live probes proved, pinned in the migration text so a later edit
// cannot quietly undo them. Each assertion names the failure it stops.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const m136 = readFileSync(`${MIG}/136_safe_to_deploy.sql`, 'utf8');
const m137 = readFileSync(`${MIG}/137_workforce_integration.sql`, 'utf8');
const m139 = readFileSync(`${MIG}/139_safety_critical_verification.sql`, 'utf8');
const m140 = readFileSync(`${MIG}/140_my_capabilities_explicit.sql`, 'utf8');
import { EXPLICIT_ONLY_CAPABILITIES } from '../capabilities';

function fn(sql: string, name: string): { header: string; body: string } {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} defined`).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return { header: sql.slice(start, open), body: sql.slice(open + 2, close) };
}
const branch = (body: string, from: string, to: string) => body.slice(body.indexOf(from), body.indexOf(to, body.indexOf(from) + from.length));

describe('136: the engine never fails open', () => {
  it('a calculation error is REVIEW_REQUIRED, and the handler cannot say READY', () => {
    const b = fn(m136, '_wf_deployment_safe').body;
    const handler = b.slice(b.indexOf('EXCEPTION WHEN OTHERS THEN'));
    expect(handler).toMatch(/'status', 'REVIEW_REQUIRED'/);
    expect(handler).toMatch(/'code', 'calculation_error'/);
    expect(handler.replace(/REVIEW_REQUIRED/g, '')).not.toMatch(/READY/);
  });
  it('every public read goes through the safe wrapper, never the raw engine', () => {
    for (const f of ['person_deployment_status', 'workforce_readiness', 'workforce_refresh']) {
      const b = fn(m136, f).body;
      expect(b, f).toMatch(/_wf_deployment_safe\(/);
      expect(b, f).not.toMatch(/_wf_deployment\(/);
    }
  });
  it('an unmet mandatory requirement outranks everything; READY is only the last branch', () => {
    const b = fn(m136, '_wf_deployment').body;
    expect(b).toMatch(/overall := CASE WHEN n_unmet > 0 THEN 'NOT_READY'\s+WHEN n_review > 0 THEN 'REVIEW_REQUIRED'\s+WHEN n_cond > 0 THEN 'CONDITIONALLY_READY'\s+ELSE 'READY' END;/);
    expect(b).toMatch(/'code', 'no_role'/);
    expect(b.match(/'status', 'READY'/g)).toBeNull();
  });
  it('the internal functions are not callable by a session', () => {
    expect(m136).toMatch(/REVOKE ALL ON FUNCTION public\._wf_soon_days\(uuid\), public\._wf_requirements\(uuid, date\),\s+public\._wf_judge\([^)]*\),\s+public\._wf_deployment\(uuid, date\), public\._wf_deployment_safe\(uuid, date\) FROM PUBLIC, anon, authenticated;/);
    expect(m136).toMatch(/REVOKE ALL ON FUNCTION public\.workforce_refresh\(uuid\), public\.workforce_refresh_due\(integer\) FROM PUBLIC, anon, authenticated;/);
    expect(m136).toMatch(/GRANT EXECUTE ON FUNCTION public\.workforce_refresh\(uuid\), public\.workforce_refresh_due\(integer\) TO service_role;/);
  });
  it('the public reads check who is asking before anything else', () => {
    const p = fn(m136, 'person_deployment_status').body;
    expect(p.indexOf('person_visible(p_person)')).toBeLessThan(p.indexOf('person_deployment_status WHERE'));
    expect(fn(m136, 'workforce_readiness').body).toMatch(/p_company IS DISTINCT FROM public\.my_company_id\(\) AND NOT public\.is_tps_staff\(\)/);
    expect(fn(m136, 'role_change_preview').body).toMatch(/public\.person_visible\(p_person\)/);
  });
  it('the cache is served only when clean, in date and calculated today (never a stale READY)', () => {
    for (const f of ['person_deployment_status', 'workforce_readiness']) {
      expect(fn(m136, f).body, f).toMatch(/NOT c\.dirty AND \(c\.valid_until IS NULL OR c\.valid_until > today\) AND c\.computed_at::date = today/);
    }
  });
  it('sessions cannot write the cache or the log', () => {
    expect(m136).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.person_deployment_status FROM anon, authenticated;/);
    expect(m136).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.deployment_status_log FROM anon, authenticated;/);
  });
});

describe('136: what counts as evidence', () => {
  const judge = fn(m136, '_wf_judge').body;
  it('competency is never inferred from training (spec: AI or training may not decide competence)', () => {
    const b = branch(judge, "WHEN 'competency' THEN", "WHEN 'qualification'").replace(/--.*$/gm, '');
    expect(b).not.toMatch(/training_records/);
    expect(b).toMatch(/pc\.verification_status = 'verified' AND pc\.verified_at::date <= p_as_of/);
  });
  it('safety-critical or evidence-required items need VERIFIED evidence', () => {
    expect(judge).toMatch(/need_verified boolean := COALESCE\(p_evidence, false\) OR COALESCE\(p_sc, false\);/);
    expect(branch(judge, "WHEN 'training' THEN", "WHEN 'competency'")).toMatch(/NOT need_verified OR \(t\.verification_status = 'verified' AND t\.verified_at::date <= p_as_of\)/);
  });
  it('medical: the category only — never the restriction text or anything clinical', () => {
    expect(m136).not.toMatch(/restriction_summary|occupational_health_clinical|clinical_notes/);
    expect(branch(judge, "WHEN 'medical' THEN", "WHEN 'authorisation'")).toMatch(/see occupational health/);
  });
  it('a pre-employment check on record is judged even without a rule', () => {
    expect(fn(m136, '_wf_deployment').body).toMatch(/FROM pre_employment_checks c\s+WHERE c\.person_id = p_person/);
  });
  it('the status log carries names and codes only, never detail text', () => {
    const r = fn(m136, 'workforce_refresh').body;
    expect(r).toMatch(/jsonb_build_object\('code', x ->> 'code', 'type', x ->> 'type', 'name', x ->> 'name',\s+'safety_critical', x -> 'safety_critical'\)/);
    expect(r).not.toMatch(/'text'/);
  });
});

describe('137: integration', () => {
  it('the outbox sees statuses only', () => {
    expect(m137).toMatch(/CREATE TRIGGER deployment_status_log_platform_event AFTER INSERT ON public\.deployment_status_log\s+FOR EACH ROW EXECUTE FUNCTION public\.platform_event_row\('person_id', 'from_status', 'to_status'\);/);
  });
  it('a requirement from a safety record needs a person to confirm a person, site or role — never the organisation', () => {
    const b = fn(m137, 'workforce_requirement_from_source').body;
    expect(b).toMatch(/NOT public\.session_can_write\(\)/);
    expect(b).toMatch(/p_scope NOT IN \('person','site','role'\)/);
    expect(b).toMatch(/p_source_type IN \('incident','corrective_action'\) AND p_scope <> 'person'/);
    expect(b).toMatch(/FROM incident_people ip WHERE ip\.incident_id = p_source_id AND ip\.person_id = p_scope_id/);
    expect(b).toMatch(/src_org IS DISTINCT FROM org/);
    expect(b).toMatch(/scope_org IS DISTINCT FROM org/);
  });
  it('leaving ends, revokes and never deletes', () => {
    const b = fn(m137, 'workforce_employee_sync').body;
    expect(b).not.toMatch(/\bDELETE\b/);
    expect(b).toMatch(/assignment_status = 'ended'/);
    expect(b).toMatch(/UPDATE requirement_exceptions SET revoked_at = now\(\)/);
    expect(b).toMatch(/UPDATE person_authorisations SET status = 'revoked'/);
  });
  it('a hire creates its assignment once (keyed) and never marks anyone deployable', () => {
    const b = fn(m137, 'workforce_employee_sync').body;
    expect(b).toMatch(/'hire:' \|\| NEW\.id\s+ON CONFLICT \(company_id, source_ref\) DO NOTHING/);
    expect(b).not.toMatch(/person_deployment_status|'READY'/);
  });
  it('duplicates are detected, never merged', () => {
    for (const f of ['person_duplicate_candidates', 'workforce_duplicate_pairs']) {
      const b = fn(m137, f).body;
      expect(b, f).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/);
    }
  });
  it('search stays SECURITY INVOKER and never matches descriptions or notes', () => {
    const s = fn(m137, 'search_records');
    expect(s.header).not.toMatch(/SECURITY DEFINER/);
    expect(s.body).not.toMatch(/description ILIKE|notes ILIKE|summary ILIKE|injured|incident_person_sensitive|rationale ILIKE/);
    expect(s.body).toMatch(/'job_role'/);
    expect(s.body).toMatch(/'training_course'/);
  });
});

describe('139: verification and the engine agree on what is safety-critical', () => {
  it('a mandatory item of a safety-critical role needs the designated verifier (QA 10, HIGH)', () => {
    const b = fn(m139, 'workforce_item_safety_critical').body;
    expect(b).toMatch(/JOIN job_roles jr ON jr\.id = r\.role_id/);
    expect(b).toMatch(/\(r\.safety_critical OR \(jr\.safety_critical AND r\.mandatory\)\)/);
    // the engine's rule, for comparison: the two must say the same thing
    expect(fn(m136, '_wf_requirements').body).toMatch(/\(r\.safety_critical OR \(jr\.safety_critical AND r\.mandatory\)\)/);
    for (const cat of ['training_courses', 'competencies', 'authorisation_types', 'occupational_health_requirements']) {
      expect(b, cat).toMatch(new RegExp(`FROM ${cat} WHERE id = p_ref AND safety_critical`));
    }
  });
  it('stays callable only from workforce_verify', () => {
    expect(m139).toMatch(/REVOKE ALL ON FUNCTION public\.workforce_item_safety_critical\(uuid, text, uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(m139).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.workforce_item_safety_critical/);
  });
});

describe('140: the capability list offers only what the database allows', () => {
  it('every explicit-only capability is tested with has_explicit_capability (staff never offered clinical)', () => {
    const f = fn(m140, 'my_capabilities');
    expect(f.header).not.toMatch(/SECURITY DEFINER/);
    const list = /c\.key IN \(([^)]*)\)/.exec(f.body)?.[1] ?? '';
    const keys = [...list.matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
    expect(keys).toEqual([...EXPLICIT_ONLY_CAPABILITIES].sort());
    expect(f.body).toMatch(/THEN public\.has_explicit_capability\(public\.my_company_id\(\), c\.key\)/);
  });
});
