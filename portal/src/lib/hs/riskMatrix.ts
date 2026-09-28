// Risk matrix arithmetic — a mirror of 123's hs_matrix_valid and
// hs_risk_level, for previews in the editor. The database computes the
// stored scores (generated columns) and validates every matrix; nothing
// here is trusted for a write. riskMatrix.test.ts pins the boundaries
// (0, 6 on a 5-wide axis, negatives, null) and the platform 5 × 5.
//
// Byte-identical in admin and portal (scripts/check-shared-dupes.sh).

import type { RiskLevel } from './safetyVocab';

export interface RiskBand { min: number; max: number; label: string; level: RiskLevel }
export interface RiskMatrix {
  likelihood_labels: string[];
  severity_labels: string[];
  bands: RiskBand[];
}

const LEVELS: readonly string[] = ['low', 'medium', 'high', 'very_high'];

/** Same rule as hs_matrix_valid: 2–10 labels per axis (1–40 chars),
 *  1–10 bands covering every score 1..L×S exactly once, in order. */
export function matrixValid(m: RiskMatrix | null | undefined): boolean {
  if (!m) return false;
  const { likelihood_labels: l, severity_labels: s, bands } = m;
  if (!Array.isArray(l) || !Array.isArray(s) || l.length < 2 || l.length > 10 || s.length < 2 || s.length > 10) return false;
  if ([...l, ...s].some(x => typeof x !== 'string' || x.trim().length < 1 || x.trim().length > 40)) return false;
  if (!Array.isArray(bands) || bands.length < 1 || bands.length > 10) return false;
  let expect = 1;
  for (const b of bands) {
    if (!Number.isInteger(b?.min) || !Number.isInteger(b?.max) || b.min !== expect || b.max < b.min) return false;
    if (!LEVELS.includes(b.level) || typeof b.label !== 'string' || b.label.trim().length < 1 || b.label.trim().length > 40) return false;
    expect = b.max + 1;
  }
  return expect === l.length * s.length + 1;
}

/** A rating on one axis is valid only as a whole number 1..axis length. */
export function ratingValid(value: unknown, axisLength: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= axisLength;
}

/** likelihood × severity, or null if either rating is not valid for this matrix. */
export function riskScore(m: RiskMatrix, likelihood: unknown, severity: unknown): number | null {
  if (!ratingValid(likelihood, m.likelihood_labels.length) || !ratingValid(severity, m.severity_labels.length)) return null;
  return likelihood * severity;
}

/** The band a score falls in (hs_risk_level), or null outside the matrix. */
export function riskBand(m: RiskMatrix, score: number | null | undefined): RiskBand | null {
  if (score == null || !Number.isInteger(score)) return null;
  return m.bands.find(b => score >= b.min && score <= b.max) ?? null;
}

/** Residual may not exceed initial (risk_items_residual_not_above_initial). */
export function residualAllowed(initial: number | null, residual: number | null): boolean {
  if (residual == null) return true;
  if (initial == null) return false;
  return residual <= initial;
}

/** CSS token for a level, for badges and matrix cells. */
export function levelColour(level: RiskLevel | null | undefined): string {
  switch (level) {
    case 'low': return 'var(--teal)';
    case 'medium': return 'var(--gold)';
    case 'high': return 'var(--red)';
    case 'very_high': return 'var(--navy)';
    default: return 'var(--ink-faint)';
  }
}
