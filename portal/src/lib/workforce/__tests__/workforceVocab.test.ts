import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as V from '../vocab';

// Every workforce tuple mirrors a CHECK in 132-136. A literal the
// database refuses fails with a 22P02/23514 only when someone presses
// Save (CLAUDE.md, "A string literal for an enum is checked by nothing
// until Postgres rejects it"); a value the database allows but the UI
// does not know renders as a raw id. Both directions fail here.

const MIG = resolve(__dirname, '../../../../../supabase/migrations');
const sql = ['132_workforce_foundation', '133_workforce_requirements', '134_workforce_evidence', '135_occupational_health', '136_safe_to_deploy']
  .map(f => readFileSync(`${MIG}/${f}.sql`, 'utf8')).join('\n');

/** Every value list the migrations give `col` in a CHECK (col IN (...)). */
function checkLists(col: string): string[][] {
  const re = new RegExp(`CHECK\\s*\\(\\s*${col}\\s+IN\\s*\\(([^)]*)\\)`, 'g');
  return [...sql.matchAll(re)].map(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort());
}
const same = (tuple: readonly string[], col: string) => {
  const lists = checkLists(col);
  expect(lists.length, `${col} has a CHECK`).toBeGreaterThan(0);
  expect(lists.some(l => JSON.stringify(l) === JSON.stringify([...tuple].sort())), `${col}: ${JSON.stringify(lists)} vs ${JSON.stringify([...tuple].sort())}`).toBe(true);
};

describe('workforce vocabularies match the database', () => {
  it.each([
    ['lifecycle_status', V.LIFECYCLE_STATUSES],
    ['engagement_type', V.ENGAGEMENT_TYPES],
    ['assignment_status', V.ASSIGNMENT_STATUSES],
    ['verification_status', V.VERIFICATION_STATUSES],
    ['result', V.TRAINING_RESULTS],
    ['assessment_method', V.ASSESSMENT_METHODS],
    ['outcome', V.HEALTH_OUTCOMES],
    ['scope', V.INDUCTION_SCOPES],
    ['scope_kind', V.AUTHORISATION_SCOPE_KINDS],
    ['delivery_method', V.DELIVERY_METHODS],
    ['category', V.OH_REQUIREMENT_CATEGORIES],
  ] as const)('%s', (col, tuple) => same(tuple, col));

  it('statuses shared by several tables', () => {
    const statusLists = checkLists('status').map(l => JSON.stringify(l));
    for (const t of [V.ATTENDANCE_STATUSES, V.SESSION_STATUSES, V.CHECK_STATUSES, V.DEVELOPMENT_STATUSES, V.DEPLOYMENT_STATUSES]) {
      expect(statusLists, JSON.stringify(t)).toContain(JSON.stringify([...t].sort()));
    }
    expect(checkLists('active_status').map(l => JSON.stringify(l))).toContain(JSON.stringify([...V.ROLE_STATUSES].sort()));
  });

  it('kinds', () => {
    const kindLists = checkLists('kind').map(l => JSON.stringify(l));
    expect(kindLists).toContain(JSON.stringify([...V.CREDENTIAL_KINDS].sort()));
    expect(kindLists).toContain(JSON.stringify([...V.EXCEPTION_KINDS].sort()));
  });

  it('training sources (134 adds hs_test and elearning to the existing list)', () => {
    same(V.TRAINING_SOURCES, 'source');
  });

  it('onboarding gates', () => {
    const m = /CHECK \(gate IN \(([^)]*)\)/.exec(sql);
    expect([...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map(x => x[1]).sort()).toEqual([...V.ONBOARDING_GATES].sort());
  });

  it('requirement types are workforce_requirement_types(), and each has a label and (but document) a catalogue', () => {
    const m = /workforce_requirement_types\(\)[\s\S]*?ARRAY\[([\s\S]*?)\]/.exec(sql);
    expect([...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map(x => x[1]).sort()).toEqual([...V.REQUIREMENT_TYPES].sort());
    for (const t of V.REQUIREMENT_TYPES) {
      expect(V.REQUIREMENT_TYPE_LABELS[t], t).toBeTruthy();
      if (t !== 'document') expect(V.REQUIREMENT_CATALOGUE[t], t).toBeTruthy();
    }
  });

  it('every requirement status the engine can produce is known here, and each has a label and colour', () => {
    const judged = new Set([...sql.slice(sql.indexOf('FUNCTION public._wf_expiry_status')).matchAll(/'(met|expiring|met_with_restrictions|excepted|not_applicable|review|unmet)'/g)].map(m => m[1]));
    expect([...judged].sort()).toEqual([...V.REQUIREMENT_STATUSES].sort());
    for (const s of V.REQUIREMENT_STATUSES) {
      expect(V.REQUIREMENT_STATUS_LABELS[s], s).toBeTruthy();
      expect(V.REQUIREMENT_STATUS_COLOURS[s], s).toMatch(/^var\(--/);
    }
  });

  it('colours are CSS variables, never hex', () => {
    for (const c of [...Object.values(V.DEPLOYMENT_STATUS_COLOURS), ...Object.values(V.REQUIREMENT_STATUS_COLOURS)]) {
      expect(c).toMatch(/^var\(--[a-z-]+\)$/);
    }
  });
});
