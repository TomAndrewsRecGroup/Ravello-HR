import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as S from '../safetyVocab';
import { HS_INCIDENT_STATUSES, incidentNextStatuses } from '../vocab';

// Every Phase 2 tuple against the CHECK the database enforces, LATEST
// definition wins. A value on one side only fails here, not as a 22P02
// on somebody's Save.
const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = ['123_hazards_risk_assessments.sql', '124_rams_coshh.sql', '125_incidents_investigations_riddor.sql']
  .map(f => readFileSync(`${MIG}/${f}`, 'utf8')).join('\n');

function listAfter(anchor: RegExp): string[] {
  const matches = [...sql.matchAll(new RegExp(anchor.source, 'g'))];
  if (matches.length === 0) throw new Error(`anchor not found: ${anchor}`);
  const m = matches[matches.length - 1];
  const rest = sql.slice(m.index! + m[0].length);
  const close = rest.search(/[\])]/);
  return [...rest.slice(0, close).matchAll(/'([A-Za-z0-9_]+)'/g)].map(x => x[1]);
}
const sorted = (xs: readonly string[]) => [...xs].sort();

describe('Phase 2 vocabularies match the SQL CHECKs', () => {
  it.each([
    ['hazard statuses',        S.HAZARD_STATUSES,        /DEFAULT 'identified' CHECK \(status IN\s*\(/],
    ['hazard sources',         S.HAZARD_SOURCES,         /DEFAULT 'quick_report' CHECK \(source IN\s*\(/],
    ['perceived seriousness',  S.RISK_LEVELS,            /perceived_seriousness IN \(/],
    ['control categories',     S.CONTROL_CATEGORIES,     /category\s+text CHECK \(category IN \(/],
    ['control effectiveness',  S.CONTROL_EFFECTIVENESS,  /effectiveness IN\s*\(/],
    ['control stage',          S.CONTROL_STAGES,         /stage IN \(/],
    ['risk item statuses',     S.RISK_ITEM_STATUSES,     /DEFAULT 'open' CHECK \(status IN \(/],
    ['persons at risk',        S.PERSONS_AT_RISK,        /persons_at_risk <@ ARRAY\[/],
    ['persons exposed',        S.PERSONS_AT_RISK,        /persons_exposed <@ ARRAY\[/],
    ['RAMS acknowledgement',   S.RAMS_ACK_METHODS,       /method IN \(/],
    ['substance types',        S.SUBSTANCE_TYPES,        /substance_type IN \(/],
    ['substance status',       S.SUBSTANCE_STATUSES,     /active_status IN \(/],
    ['GHS pictograms',         S.GHS_PICTOGRAMS,         /pictograms <@ ARRAY\[/],
    ['exposure routes',        S.EXPOSURE_ROUTES,        /exposure_routes <@ ARRAY\[/],
    ['immediate actions',      S.INCIDENT_IMMEDIATE_ACTIONS, /immediate_actions <@ ARRAY\[/],
    ['RIDDOR incident status', S.RIDDOR_REVIEW_STATUSES, /hs_incidents_riddor_status_check CHECK \(riddor_review_status IN \(/],
    ['RIDDOR review status',   S.RIDDOR_REVIEW_ROW_STATUSES, /DEFAULT 'review_required' CHECK \(status IN \(/],
    ['RIDDOR decisions',       S.RIDDOR_DECISIONS,       /decision\s+text CHECK \(decision IN \(/],
    ['incident person roles',  S.INCIDENT_PERSON_ROLES,  /role_in_incident IN \(/],
    ['body parts',             S.BODY_PARTS,             /body_parts <@ ARRAY\[/],
    ['injury types',           S.INJURY_TYPES,           /injury_types <@ ARRAY\[/],
    ['treatment',              S.TREATMENTS,             /treatment IN \(/],
    ['hospital attendance',    S.HOSPITAL_ATTENDANCE,    /hospital_attendance IN \(/],
    ['investigation statuses', S.INVESTIGATION_STATUSES, /DEFAULT 'in_progress' CHECK \(status IN \(/],
    ['cause levels',           S.CAUSE_LEVELS,           /cause_level IN \(/],
    ['cause categories',       S.CAUSE_CATEGORIES,       /category\s+text NOT NULL CHECK \(category IN \(/],
    ['action classes',         S.ACTION_CLASSES,         /action_class IN \(/],
    ['effectiveness outcomes', S.EFFECTIVENESS_OUTCOMES, /effectiveness_outcome IN \(/],
  ] as const)('%s', (_name, tuple, anchor) => {
    expect(sorted(tuple)).toEqual(sorted(listAfter(anchor)));
  });

  it('control type tuple matches every control_type CHECK, in hierarchy order', () => {
    const all = [...sql.matchAll(/control_type IN \(([^)]+)\)/g)].map(m => [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]));
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const l of all) expect(l).toEqual([...S.CONTROL_TYPES]);
  });

  it('document status tuples match RA/COSHH and RAMS', () => {
    const lists = [...sql.matchAll(/DEFAULT 'draft' CHECK \(status IN\s*\(([^)]+)\)/g)]
      .map(m => sorted([...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1])));
    expect(lists).toContainEqual(sorted(S.DOC_STATUSES));
    expect(lists).toContainEqual(sorted(S.RAMS_STATUSES));
  });

  it('review reasons: RA/RAMS and COSHH', () => {
    const lists = [...sql.matchAll(/review_reason IN \(([^)]+)\)/g)].map(m => sorted([...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1])));
    expect(lists).toContainEqual(sorted(S.RA_REVIEW_REASONS));
    expect(lists).toContainEqual(sorted(S.COSHH_REVIEW_REASONS));
    for (const r of [...S.RA_REVIEW_REASONS, ...S.COSHH_REVIEW_REASONS]) expect(S.REVIEW_REASON_LABELS[r]).toBeTruthy();
  });

  it('RAMS section keys match hs_rams_sections_valid', () => {
    expect(sorted(S.RAMS_SECTION_KEYS)).toEqual(sorted(listAfter(/WHERE e\.key NOT IN \(/)));
  });

  it('RIDDOR flags are the review columns', () => {
    const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.riddor_reviews'));
    for (const f of S.RIDDOR_FLAGS) expect(table).toMatch(new RegExp(`\\n\\s+${f}\\s+boolean`));
  });

  it('5 Whys bounds match the CHECK', () => {
    expect(sql).toMatch(new RegExp(`cardinality\\(whys\\) BETWEEN ${S.WHYS_MIN} AND ${S.WHYS_MAX}`));
  });

  it('every label map covers its tuple exactly', () => {
    const pairs: [readonly string[], Record<string, string>][] = [
      [S.HAZARD_STATUSES, S.HAZARD_STATUS_LABELS], [S.HAZARD_SOURCES, S.HAZARD_SOURCE_LABELS],
      [S.RISK_LEVELS, S.RISK_LEVEL_LABELS], [S.CONTROL_TYPES, S.CONTROL_TYPE_LABELS],
      [S.CONTROL_CATEGORIES, S.CONTROL_CATEGORY_LABELS], [S.CONTROL_EFFECTIVENESS, S.CONTROL_EFFECTIVENESS_LABELS],
      [S.DOC_STATUSES, S.DOC_STATUS_LABELS], [S.RISK_ITEM_STATUSES, S.RISK_ITEM_STATUS_LABELS],
      [S.PERSONS_AT_RISK, S.PERSONS_AT_RISK_LABELS], [S.RAMS_SECTION_KEYS, S.RAMS_SECTION_LABELS],
      [S.RAMS_ACK_METHODS, S.RAMS_ACK_METHOD_LABELS], [S.GHS_PICTOGRAMS, S.GHS_PICTOGRAM_LABELS],
      [S.EXPOSURE_ROUTES, S.EXPOSURE_ROUTE_LABELS], [S.INCIDENT_IMMEDIATE_ACTIONS, S.INCIDENT_IMMEDIATE_ACTION_LABELS],
      [S.RIDDOR_REVIEW_STATUSES, S.RIDDOR_REVIEW_STATUS_LABELS], [S.RIDDOR_DECISIONS, S.RIDDOR_DECISION_LABELS],
      [S.RIDDOR_FLAGS, S.RIDDOR_FLAG_LABELS], [S.INCIDENT_PERSON_ROLES, S.INCIDENT_PERSON_ROLE_LABELS],
      [S.TREATMENTS, S.TREATMENT_LABELS], [S.HOSPITAL_ATTENDANCE, S.HOSPITAL_ATTENDANCE_LABELS],
      [S.INVESTIGATION_STATUSES, S.INVESTIGATION_STATUS_LABELS], [S.CAUSE_LEVELS, S.CAUSE_LEVEL_LABELS],
      [S.CAUSE_CATEGORIES, S.CAUSE_CATEGORY_LABELS], [S.ACTION_CLASSES, S.ACTION_CLASS_LABELS],
      [S.EFFECTIVENESS_OUTCOMES, S.EFFECTIVENESS_OUTCOME_LABELS],
    ];
    for (const [tuple, labels] of pairs) expect(sorted(Object.keys(labels))).toEqual(sorted(tuple));
  });
});

describe('transition mirrors equal the SQL functions', () => {
  function pairsOf(fn: string): string[] {
    const start = sql.lastIndexOf(`FUNCTION public.${fn}(`);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    return [...body.matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)].map(m => `${m[1]}>${m[2]}`).sort();
  }

  it('controlled documents (hs_doc_transition_ok), RAMS excluded from review_due', () => {
    const sqlPairs = pairsOf('hs_doc_transition_ok');
    const tsPairs = S.DOC_STATUSES.flatMap(f => S.docNextStatuses('risk_assessment', f).map(t => `${f}>${t}`)).sort();
    expect(tsPairs).toEqual(sqlPairs);
    for (const f of S.DOC_STATUSES) expect(S.docNextStatuses('method_statement', f)).not.toContain('review_due');
    expect(S.docNextStatuses('method_statement', 'review_due')).toEqual([]);
  });

  it('incidents (hs_incident_transition_ok)', () => {
    const sqlPairs = pairsOf('hs_incident_transition_ok');
    const tsPairs = HS_INCIDENT_STATUSES.flatMap(f => incidentNextStatuses(f).map(t => `${f}>${t}`)).sort();
    expect(tsPairs).toEqual(sqlPairs);
  });
});
