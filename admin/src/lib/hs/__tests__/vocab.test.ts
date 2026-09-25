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
  + readFileSync(`${MIG}/112_hs_incidents_equipment_toolbox.sql`, 'utf8');

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
    ['outcomes',          V.HS_COMPLETION_OUTCOMES,  /outcome IN \(/],
    ['incident types',    V.HS_INCIDENT_TYPES,       /CHECK \(incident_type IN \(/],
    ['incident severities', V.HS_INCIDENT_SEVERITIES, /severity IN \(/],
    ['incident statuses', V.HS_INCIDENT_STATUSES,    /DEFAULT 'open' CHECK \(status IN \(/],
    ['equipment statuses', V.HS_EQUIPMENT_STATUSES,  /DEFAULT 'in_service' CHECK \(status IN \(/],
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
