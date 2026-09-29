import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as V from '../vocab';

// The tuples in vocab.ts against the CHECK lists in the SQL that the
// database actually enforces. Either side gaining a value alone fails.
const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = readFileSync(`${MIG}/094_hs_providers_access.sql`, 'utf8')
  + readFileSync(`${MIG}/095_hs_core.sql`, 'utf8')
  // 112 replaces hs_activities' activity_type CHECK to add 'toolbox_talk'
  // (DROP CONSTRAINT + ADD CONSTRAINT) — the LAST occurrence of the
  // anchor is the live one, same "latest definition wins" rule
  // hsSqlShape.test.ts and platformEventsSql.test.ts already use.
  + readFileSync(`${MIG}/112_hs_incidents_equipment_toolbox.sql`, 'utf8')
  + readFileSync(`${MIG}/114_hs_equipment_inspections.sql`, 'utf8')
  // 125 replaces the incident type / severity / status vocabulary.
  + readFileSync(`${MIG}/125_incidents_investigations_riddor.sql`, 'utf8')
  // 144 replaces hs_equipment's status CHECK to add 'quarantined' (DROP
  // CONSTRAINT + ADD CONSTRAINT, same name — confirmed live as the ONE
  // surviving constraint) and adds asset_type.
  + readFileSync(`${MIG}/144_asset_register.sql`, 'utf8')
  // 148 adds the PUWER assessment outcome vocabulary.
  + readFileSync(`${MIG}/148_puwer_assessments.sql`, 'utf8')
  // 149 adds the examination_type vocabulary.
  + readFileSync(`${MIG}/149_loler_examinations.sql`, 'utf8')
  // 150 adds the contractor approval status / risk rating / insurance type vocabularies.
  + readFileSync(`${MIG}/150_contractors.sql`, 'utf8')
  // 152 adds the permit type / status vocabularies.
  + readFileSync(`${MIG}/152_permit_to_work.sql`, 'utf8')
  // 153 adds the isolation type / status vocabularies.
  + readFileSync(`${MIG}/153_isolation_loto.sql`, 'utf8')
  // 154 adds the emergency plan type / status and drill outcome vocabularies.
  + readFileSync(`${MIG}/154_emergency_planning.sql`, 'utf8')
  // 156 adds the environmental aspect type / condition / status vocabularies.
  + readFileSync(`${MIG}/156_environmental_aspects.sql`, 'utf8')
  // 157 adds spill receiving-environment/status, monitoring category
  // and environmental permit / permit condition status vocabularies.
  + readFileSync(`${MIG}/157_environmental_incidents_waste_monitoring_permits.sql`, 'utf8')
  // 159 adds the Legal Register's applicability status, compliance
  // evaluation status, requirement category and research-note source
  // vocabularies.
  + readFileSync(`${MIG}/159_legal_register.sql`, 'utf8');

/** The quoted values in the IN (...) or ARRAY[...] after the LAST match of `anchor`. */
function listAfter(anchor: RegExp): string[] {
  const global = new RegExp(anchor.source, 'g');
  const matches = [...sql.matchAll(global)];
  if (matches.length === 0) throw new Error(`anchor not found: ${anchor}`);
  const m = matches[matches.length - 1];
  const rest = sql.slice(m.index! + m[0].length);
  const close = rest.search(/[\])]/);
  return [...rest.slice(0, close).matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
}

describe('H&S vocabularies match the SQL CHECKs', () => {
  it.each([
    ['scopes',            V.HS_SCOPES,               /scopes <@ ARRAY\[/],
    ['activity types',    V.HS_ACTIVITY_TYPES,       /activity_type IN \(/],
    ['recurrence',        V.HS_RECURRENCE_UNITS,     /recurrence_unit IN \(/],
    ['outcomes',          V.HS_COMPLETION_OUTCOMES,  /DEFAULT 'pass' CHECK \(outcome IN \(/],
    ['incident types',    V.HS_INCIDENT_TYPES,       /hs_incidents_incident_type_check CHECK \(incident_type IN \(/],
    ['incident severities', V.HS_INCIDENT_SEVERITIES, /hs_incidents_severity_check CHECK \(severity IS NULL OR severity IN \(/],
    ['incident statuses', V.HS_INCIDENT_STATUSES,    /hs_incidents_status_check CHECK \(status IN \(/],
    ['equipment statuses', V.HS_EQUIPMENT_STATUSES,  /hs_equipment_status_check\s*CHECK \(status IN \(/],
    // Anchored on the preceding inspected_on column: 148's puwer_assessments
    // table has a textually identical "outcome text NOT NULL CHECK
    // (outcome IN (" phrase, and listAfter() takes the LAST match in the
    // concatenated sql — an unqualified anchor here would silently start
    // resolving to 148's tuple instead of 114's.
    ['equipment inspection outcomes', V.HS_EQUIPMENT_INSPECTION_OUTCOMES,
      /inspected_on\s+date NOT NULL CHECK \(inspected_on <= current_date \+ 1\),\s*outcome\s+text NOT NULL CHECK \(outcome IN \(/],
    ['asset types', V.HS_ASSET_TYPES, /asset_type\s+text\s*CHECK \(asset_type IS NULL OR asset_type IN\s*\(/],
    // A distinguishing preceding column is required here: 114's
    // hs_equipment_inspections.outcome CHECK is textually IDENTICAL
    // ("outcome          text NOT NULL CHECK (outcome IN (") to this
    // table's, and listAfter() always takes the LAST match in the
    // concatenated sql — without this, both tuples would silently
    // resolve to whichever migration is read last.
    ['PUWER assessment outcomes', V.PUWER_ASSESSMENT_OUTCOMES,
      /inspection_id\s+uuid REFERENCES public\.inspections\(id\) ON DELETE SET NULL,\s*outcome\s+text NOT NULL CHECK \(outcome IN \(/],
    ['examination types', V.HS_EXAMINATION_TYPES, /examination_type IS NULL OR examination_type IN \(/],
    ['contractor approval statuses', V.CONTRACTOR_APPROVAL_STATUSES, /approval_status\s+text NOT NULL DEFAULT 'pending' CHECK \(approval_status IN \(/],
    ['contractor risk ratings', V.CONTRACTOR_RISK_RATINGS, /risk_rating IS NULL OR risk_rating IN \(/],
    ['contractor insurance types', V.CONTRACTOR_INSURANCE_TYPES, /insurance_type\s+text NOT NULL CHECK \(insurance_type IN \(/],
    ['permit types', V.PERMIT_TYPES, /permit_type\s+text NOT NULL CHECK \(permit_type IN \(/],
    // 156's environmental_aspects ALSO defaults status to 'draft' with an
    // identical "status text NOT NULL DEFAULT 'draft' CHECK (status IN ("
    // phrase — anchored on the preceding scope_of_work column, unique to
    // permits, the same "distinguish via preceding context" rule this
    // file already follows for 114/148's outcome collision.
    ['permit statuses', V.PERMIT_STATUSES,
      /scope_of_work\s+text NOT NULL CHECK \(length\(btrim\(scope_of_work\)\) BETWEEN 1 AND 4000\),\s*status\s+text NOT NULL DEFAULT 'draft' CHECK \(status IN \(/],
    ['isolation types', V.ISOLATION_TYPES, /isolation_type\s+text NOT NULL CHECK \(isolation_type IN \(/],
    ['isolation statuses', V.ISOLATION_STATUSES, /status\s+text NOT NULL DEFAULT 'applied' CHECK \(status IN \(/],
    ['emergency plan types', V.EMERGENCY_PLAN_TYPES, /plan_type\s+text NOT NULL CHECK \(plan_type IN \(/],
    // hs_documents (106) has an IDENTICAL "status text NOT NULL DEFAULT
    // 'active' CHECK (status IN (" phrase — anchored from the table's
    // own plan_type column (unique to emergency_plans) through to its
    // status column, the same "distinguish via preceding context" rule
    // 114/148's outcome anchors already established.
    ['emergency plan statuses', V.EMERGENCY_PLAN_STATUSES,
      /plan_type\s+text NOT NULL CHECK \(plan_type IN \([\s\S]*?status\s+text NOT NULL DEFAULT 'active' CHECK \(status IN \(/],
    // 114/148 both have a textually-identical "outcome text NOT NULL
    // CHECK (outcome IN (" phrase; anchored on evacuation_time_seconds,
    // unique to emergency_drills.
    ['emergency drill outcomes', V.EMERGENCY_DRILL_OUTCOMES,
      /evacuation_time_seconds\s+integer CHECK \(evacuation_time_seconds IS NULL OR evacuation_time_seconds >= 0\),\s*outcome\s+text NOT NULL CHECK \(outcome IN \(/],
    ['environmental aspect types', V.ENVIRONMENTAL_ASPECT_TYPES, /aspect_type\s+text NOT NULL CHECK \(aspect_type IN \(/],
    ['environmental aspect conditions', V.ENVIRONMENTAL_ASPECT_CONDITIONS, /condition\s+text NOT NULL DEFAULT 'normal' CHECK \(condition IN \(/],
    // Anchored on the preceding version column, unique to
    // environmental_aspects — 152's permits table has an identical
    // "status text NOT NULL DEFAULT 'draft' CHECK (status IN (" phrase.
    ['environmental aspect statuses', V.ENVIRONMENTAL_ASPECT_STATUSES,
      /version\s+integer NOT NULL DEFAULT 1 CHECK \(version >= 1\),\s*status\s+text NOT NULL DEFAULT 'draft' CHECK \(status IN \(/],
    // 157's spill table uses NOT NULL (no default); the incident-detail
    // table's own receiving_environment CHECK is nullable and textually
    // distinct ("IS NULL OR receiving_environment IN ("), so no anchor
    // collision here.
    ['environmental spill receiving environments', V.ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENTS,
      /receiving_environment text NOT NULL CHECK \(receiving_environment IN \(/],
    ['environmental spill statuses', V.ENVIRONMENTAL_SPILL_STATUSES,
      /status\s+text NOT NULL DEFAULT 'reported' CHECK \(status IN \(/],
    ['environmental monitoring categories', V.ENVIRONMENTAL_MONITORING_CATEGORIES,
      /category\s+text NOT NULL DEFAULT 'other' CHECK \(category IN \(/],
    // Anchored through the preceding issued_on/expires_on columns,
    // unique to environmental_permits — emergency_plans (154) also
    // defaults its own status to 'active'.
    ['environmental permit statuses', V.ENVIRONMENTAL_PERMIT_STATUSES,
      /issued_on\s+date,\s*expires_on\s+date,\s*status\s+text NOT NULL DEFAULT 'active' CHECK \(status IN \(/],
    ['permit condition statuses', V.PERMIT_CONDITION_STATUSES,
      /status\s+text NOT NULL DEFAULT 'current' CHECK \(status IN \(/],
    // Core-OS 360 Phase 5, Group 4 (159): the Legal Register. 159 is the
    // LAST migration concatenated into `sql`, so a generic anchor
    // resolves to its own occurrence regardless of earlier collisions.
    ['legal requirement categories', V.LEGAL_REQUIREMENT_CATEGORIES,
      /category\s+text NOT NULL CHECK \(category IN \(/],
    ['legal applicability statuses', V.LEGAL_APPLICABILITY_STATUSES,
      /applicability_status\s+text NOT NULL DEFAULT 'not_assessed' CHECK \(applicability_status IN \(/],
    ['compliance evaluation statuses', V.COMPLIANCE_EVALUATION_STATUSES,
      /status\s+text NOT NULL CHECK \(status IN \(/],
    ['legal research sources', V.LEGAL_RESEARCH_SOURCES,
      /source\s+text NOT NULL CHECK \(source IN \(/],
  ] as const)('%s', (_name, tuple, anchor) => {
    expect([...tuple].sort()).toEqual(listAfter(anchor).sort());
  });

  it('every label map covers its tuple exactly', () => {
    const pairs: [readonly string[], Record<string, string>][] = [
      [V.HS_SCOPES, V.HS_SCOPE_LABELS],
      [V.HS_ACTIVITY_TYPES, V.HS_ACTIVITY_TYPE_LABELS],
      [V.HS_COMPLETION_OUTCOMES, V.HS_COMPLETION_OUTCOME_LABELS],
      [V.HS_REGISTER_CATEGORIES, V.HS_REGISTER_CATEGORY_LABELS],
      [V.HS_INCIDENT_TYPES, V.HS_INCIDENT_TYPE_LABELS],
      [V.HS_INCIDENT_SEVERITIES, V.HS_INCIDENT_SEVERITY_LABELS],
      [V.HS_INCIDENT_STATUSES, V.HS_INCIDENT_STATUS_LABELS],
      [V.HS_EQUIPMENT_STATUSES, V.HS_EQUIPMENT_STATUS_LABELS],
      [V.HS_EQUIPMENT_INSPECTION_OUTCOMES, V.HS_EQUIPMENT_INSPECTION_OUTCOME_LABELS],
      [V.HS_ASSET_TYPES, V.HS_ASSET_TYPE_LABELS],
      [V.PUWER_ASSESSMENT_OUTCOMES, V.PUWER_ASSESSMENT_OUTCOME_LABELS],
      [V.HS_EXAMINATION_TYPES, V.HS_EXAMINATION_TYPE_LABELS],
      [V.CONTRACTOR_APPROVAL_STATUSES, V.CONTRACTOR_APPROVAL_STATUS_LABELS],
      [V.CONTRACTOR_RISK_RATINGS, V.CONTRACTOR_RISK_RATING_LABELS],
      [V.CONTRACTOR_INSURANCE_TYPES, V.CONTRACTOR_INSURANCE_TYPE_LABELS],
      [V.PERMIT_TYPES, V.PERMIT_TYPE_LABELS],
      [V.PERMIT_STATUSES, V.PERMIT_STATUS_LABELS],
      [V.ISOLATION_TYPES, V.ISOLATION_TYPE_LABELS],
      [V.ISOLATION_STATUSES, V.ISOLATION_STATUS_LABELS],
      [V.EMERGENCY_PLAN_TYPES, V.EMERGENCY_PLAN_TYPE_LABELS],
      [V.EMERGENCY_PLAN_STATUSES, V.EMERGENCY_PLAN_STATUS_LABELS],
      [V.EMERGENCY_DRILL_OUTCOMES, V.EMERGENCY_DRILL_OUTCOME_LABELS],
      [V.ENVIRONMENTAL_ASPECT_TYPES, V.ENVIRONMENTAL_ASPECT_TYPE_LABELS],
      [V.ENVIRONMENTAL_ASPECT_CONDITIONS, V.ENVIRONMENTAL_ASPECT_CONDITION_LABELS],
      [V.ENVIRONMENTAL_ASPECT_STATUSES, V.ENVIRONMENTAL_ASPECT_STATUS_LABELS],
      [V.ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENTS, V.ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS],
      [V.ENVIRONMENTAL_SPILL_STATUSES, V.ENVIRONMENTAL_SPILL_STATUS_LABELS],
      [V.ENVIRONMENTAL_MONITORING_CATEGORIES, V.ENVIRONMENTAL_MONITORING_CATEGORY_LABELS],
      [V.ENVIRONMENTAL_PERMIT_STATUSES, V.ENVIRONMENTAL_PERMIT_STATUS_LABELS],
      [V.PERMIT_CONDITION_STATUSES, V.PERMIT_CONDITION_STATUS_LABELS],
      [V.ISO_STANDARD_CODES, V.ISO_STANDARD_CODE_LABELS],
      [V.STANDARD_EVIDENCE_ENTITY_TYPES, V.STANDARD_EVIDENCE_ENTITY_TYPE_LABELS],
      [V.LEGAL_REQUIREMENT_CATEGORIES, V.LEGAL_REQUIREMENT_CATEGORY_LABELS],
      [V.LEGAL_APPLICABILITY_STATUSES, V.LEGAL_APPLICABILITY_STATUS_LABELS],
      [V.COMPLIANCE_EVALUATION_STATUSES, V.COMPLIANCE_EVALUATION_STATUS_LABELS],
      [V.LEGAL_RESEARCH_SOURCES, V.LEGAL_RESEARCH_SOURCE_LABELS],
    ];
    for (const [tuple, labels] of pairs) expect(Object.keys(labels).sort()).toEqual([...tuple].sort());
  });

  it('the provider-only vocabularies (types, access levels, assignment statuses) are gone', () => {
    expect((V as Record<string, unknown>).HS_PROVIDER_TYPES).toBeUndefined();
    expect((V as Record<string, unknown>).HS_ACCESS_LEVELS).toBeUndefined();
    expect((V as Record<string, unknown>).HS_ASSIGNMENT_STATUSES).toBeUndefined();
  });

  it('every register category is H&S by the database rule', () => {
    for (const c of V.HS_REGISTER_CATEGORIES) expect(V.domainOf(c)).toBe('hs');
    expect(V.domainOf('health_safety')).toBe('hs');
    expect(V.domainOf('hr_payroll')).toBe('hr');
    expect(V.domainOf('employment')).toBe('hr');
    expect(sql).toContain("CASE WHEN category LIKE 'hs\\_%' OR category = 'health_safety' THEN 'hs' ELSE 'hr' END");
  });
});

// Core-OS 360 Phase 5, Group 3 (migration 158): management_system_
// standards.code is SEEDED, not CHECK-constrained (deliberately
// extensible to a third standard later — see 158's own header comment),
// so ISO_STANDARD_CODES is pinned against the literal INSERT rather
// than a CHECK list.
describe('ISO management-system framework (158)', () => {
  const m158 = readFileSync(`${MIG}/158_iso_management_system_framework.sql`, 'utf8');

  it('ISO_STANDARD_CODES matches the two seeded standard codes', () => {
    const start = m158.indexOf('management_system_standards (id, code, name) VALUES');
    const block = m158.slice(start, m158.indexOf(';', start));
    const seeded = [...block.matchAll(/'[0-9a-f-]+',\s*'([a-z0-9_]+)'/g)].map(m => m[1]);
    expect(seeded.length).toBe(2);
    expect([...V.ISO_STANDARD_CODES].sort()).toEqual(seeded.sort());
  });

  it('management_system_standards.code is extensible, never CHECK-restricted to only the seed', () => {
    // A format/length CHECK is fine; a value-list CHECK would defeat
    // "extensible to more standards later" (rule 1).
    expect(m158).toMatch(/code\s+text NOT NULL UNIQUE CHECK \(code ~/);
    expect(m158).not.toMatch(/code\s+text NOT NULL UNIQUE CHECK \(code IN \(/);
  });

  const clauseBlockStart = m158.indexOf('standard_clauses (standard_id, clause_number, title, maps_to_hint, display_order) VALUES');
  const clauseBlock = m158.slice(clauseBlockStart);
  // Each clause tuple: (standard_id, 'clause_number', 'title', 'hint'|NULL, display_order)
  const clauseTuples = [...clauseBlock.matchAll(/'[0-9a-f-]+',\s*'([^']*)',\s*'([^']*)',\s*'([a-z_]+)',\s*\d+\)/g)];

  it('every seeded clause names a real hs_entity_table() key as its maps_to_hint', () => {
    expect(clauseTuples.length).toBe(24);
    for (const [, , , hint] of clauseTuples) expect(V.STANDARD_EVIDENCE_ENTITY_TYPES as readonly string[]).toContain(hint);
  });

  it('no clause or standard title asserts compliance or certification', () => {
    for (const [, , title] of clauseTuples) expect(title.toLowerCase()).not.toMatch(/compliant|certified/);
    const start = m158.indexOf('management_system_standards (id, code, name) VALUES');
    const stdBlock = m158.slice(start, m158.indexOf(';', start));
    const stdTitles = [...stdBlock.matchAll(/'[a-z0-9_]+',\s*'([^']*)'/g)].map(m => m[1]);
    expect(stdTitles.length).toBe(2);
    for (const t of stdTitles) expect(t.toLowerCase()).not.toMatch(/compliant|certified/);
  });
});

// Core-OS 360 Phase 5, Group 4 (migration 159): the Legal Register.
// Rule 2 is EXACT and absolute — never "compliant"/"non_compliant"/
// "legal"/"illegal" as a standalone compliance-verdict word anywhere in
// these labels (the table names legal_requirements/legal_register are
// fine; it is a VERDICT word this checks for).
describe('the Legal Register (159) never asserts a compliance verdict', () => {
  const m159 = readFileSync(`${MIG}/159_legal_register.sql`, 'utf8');

  it('no label anywhere in this vocabulary reads compliant/non-compliant/illegal', () => {
    const labelMaps: Record<string, string>[] = [
      { ...V.LEGAL_APPLICABILITY_STATUS_LABELS },
      { ...V.COMPLIANCE_EVALUATION_STATUS_LABELS },
      { ...V.LEGAL_REQUIREMENT_CATEGORY_LABELS },
      { ...V.LEGAL_RESEARCH_SOURCE_LABELS },
    ];
    for (const map of labelMaps) {
      for (const label of Object.values(map)) {
        expect(label.toLowerCase()).not.toMatch(/\bcompliant\b|\bnon-compliant\b|\billegal\b/);
      }
    }
  });

  it('compliance_evaluations.status is EXACTLY the six-value cautious vocabulary, never widened', () => {
    expect([...V.COMPLIANCE_EVALUATION_STATUSES].sort()).toEqual([
      'confirmed_noncompliance', 'evidence_current', 'evidence_incomplete',
      'not_evaluated', 'potential_noncompliance', 'review_due',
    ].sort());
    expect(m159).not.toMatch(/status IN \([^)]*'compliant'/);
    expect(m159).not.toMatch(/status IN \([^)]*'non_compliant'/);
  });

  it('an applicability decision needs a named assessor before it may read applicable/not_applicable', () => {
    const fn = m159.slice(
      m159.indexOf('FUNCTION public.organisation_legal_obligations_stamp'),
      m159.indexOf('REVOKE ALL ON FUNCTION public.organisation_legal_obligations_stamp'));
    expect(fn).toMatch(/applicability_status IN \('applicable', 'not_applicable'\)/);
    expect(fn).toMatch(/assessed_by IS NULL OR NEW\.assessed_at IS NULL/);
  });
});
