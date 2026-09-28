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
  + readFileSync(`${MIG}/148_puwer_assessments.sql`, 'utf8');

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
