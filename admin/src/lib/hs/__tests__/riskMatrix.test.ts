import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matrixValid, ratingValid, residualAllowed, riskBand, riskScore, type RiskMatrix } from '../riskMatrix';

// The platform default, parsed from 123's seed so the test cannot drift
// from what is live.
const sql = readFileSync(resolve(__dirname, '../../../../../supabase/migrations/123_hazards_risk_assessments.sql'), 'utf8');
const seed = sql.slice(sql.indexOf("'Standard 5 × 5'"));
const arrays = [...seed.matchAll(/ARRAY\[([^\]]+)\]/g)].slice(0, 2).map(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
const bands = JSON.parse(/'(\[\{[\s\S]*?\}\])'::jsonb/.exec(seed)![1]);
const STD: RiskMatrix = { likelihood_labels: arrays[0], severity_labels: arrays[1], bands };

describe('platform 5 × 5', () => {
  it('parses and is valid', () => {
    expect(STD.likelihood_labels).toHaveLength(5);
    expect(STD.severity_labels).toHaveLength(5);
    expect(matrixValid(STD)).toBe(true);
  });
  it('band boundaries 1-4 / 5-9 / 10-16 / 17-25', () => {
    expect([1, 4, 5, 9, 10, 16, 17, 25].map(s => riskBand(STD, s)?.level))
      .toEqual(['low', 'low', 'medium', 'medium', 'high', 'high', 'very_high', 'very_high']);
  });
});

describe('ratings and scores — boundary attacks', () => {
  it.each([0, 6, -1, 2.5, NaN, Infinity, null, undefined, '3'])('rating %s is refused on a 5-wide axis', v => {
    expect(ratingValid(v, 5)).toBe(false);
    expect(riskScore(STD, v, 3)).toBeNull();
    expect(riskScore(STD, 3, v)).toBeNull();
  });
  it('1 and 5 are the valid extremes', () => {
    expect(riskScore(STD, 1, 1)).toBe(1);
    expect(riskScore(STD, 5, 5)).toBe(25);
  });
  it('no band outside the matrix', () => {
    for (const s of [0, 26, -3, null, undefined, 4.5]) expect(riskBand(STD, s as number)).toBeNull();
  });
  it('residual may not exceed initial', () => {
    expect(residualAllowed(12, 12)).toBe(true);
    expect(residualAllowed(12, 13)).toBe(false);
    expect(residualAllowed(12, null)).toBe(true);
    expect(residualAllowed(null, 4)).toBe(false);
  });
});

describe('matrix validation mirrors hs_matrix_valid', () => {
  const ok = (): RiskMatrix => JSON.parse(JSON.stringify(STD));
  it('a gap in the bands is invalid', () => {
    const m = ok(); m.bands[1].min = 6; expect(matrixValid(m)).toBe(false);
  });
  it('bands that stop short of L×S are invalid', () => {
    const m = ok(); m.bands[3].max = 24; expect(matrixValid(m)).toBe(false);
  });
  it('an unknown level is invalid', () => {
    const m = ok(); (m.bands[0] as { level: string }).level = 'extreme'; expect(matrixValid(m)).toBe(false);
  });
  it('a 1-label axis or an 11-label axis is invalid', () => {
    const a = ok(); a.likelihood_labels = ['Only']; expect(matrixValid(a)).toBe(false);
    const b = ok(); b.severity_labels = Array.from({ length: 11 }, (_, i) => `S${i}`); expect(matrixValid(b)).toBe(false);
  });
  it('a blank label is invalid', () => {
    const m = ok(); m.likelihood_labels[2] = '  '; expect(matrixValid(m)).toBe(false);
  });
  it('a 3 × 3 with complete bands is valid', () => {
    expect(matrixValid({ likelihood_labels: ['L', 'M', 'H'], severity_labels: ['L', 'M', 'H'],
      bands: [{ min: 1, max: 3, label: 'Low', level: 'low' }, { min: 4, max: 9, label: 'High', level: 'high' }] })).toBe(true);
  });
  it('null is invalid', () => { expect(matrixValid(null)).toBe(false); });
});
