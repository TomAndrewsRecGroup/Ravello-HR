import { describe, expect, it } from 'vitest';
import { daysBetween, trainingFindingText, trainingFindingTone } from '../trainingFinding';
import { TRAINING_FINDINGS } from '../safetyVocab';

const at = '2026-09-27';

describe('trainingFindingText — the spec 59 sentence', () => {
  it('expired: counts the days between expiry and the incident', () => {
    expect(trainingFindingText({ status_at_incident: 'expired', completed_on: '2024-07-20', expires_on: '2026-09-13', incident_date: at }))
      .toBe('Completed 20 Jul 2024 · expired 14 days before the incident');
  });
  it('expired the day before: one day, singular', () => {
    expect(trainingFindingText({ status_at_incident: 'expired', completed_on: '2024-07-20', expires_on: '2026-09-26', incident_date: at }))
      .toMatch(/expired 1 day before the incident$/);
  });
  it('in date: never says "expired"', () => {
    const t = trainingFindingText({ status_at_incident: 'current', completed_on: '2025-01-01', expires_on: '2026-10-07', incident_date: at });
    expect(t).toBe('Completed 1 Jan 2025 · in date, valid until 7 Oct 2026 (10 days after the incident)');
    expect(t).not.toMatch(/expired/);
  });
  it('in date, expiring that very day', () => {
    expect(trainingFindingText({ status_at_incident: 'current', completed_on: '2025-01-01', expires_on: at, incident_date: at }))
      .toMatch(/\(the day of the incident\)$/);
  });
  it('no expiry', () => {
    expect(trainingFindingText({ status_at_incident: 'no_expiry', completed_on: '2025-01-01', expires_on: null, incident_date: at }))
      .toBe('Completed 1 Jan 2025 · no expiry');
  });
  it('completed after the incident', () => {
    expect(trainingFindingText({ status_at_incident: 'completed_after', completed_on: '2026-09-30', expires_on: null, incident_date: at }))
      .toMatch(/^Completed 30 \w+ 2026 · 3 days after the incident$/);
  });
  it('nothing on record', () => {
    expect(trainingFindingText({ status_at_incident: 'not_recorded', completed_on: null, expires_on: null, incident_date: at }))
      .toBe('No completion on record');
  });
  it('no sentence ever asserts causation', () => {
    for (const s of TRAINING_FINDINGS) {
      const t = trainingFindingText({ status_at_incident: s, completed_on: s === 'not_recorded' ? null : '2025-01-01',
        expires_on: s === 'expired' ? '2026-01-01' : s === 'current' ? '2027-01-01' : null,
        incident_date: s === 'completed_after' ? '2024-12-01' : at });
      expect(t).not.toMatch(/caus|contribut|inadequate|fail|blame|root/i);
    }
  });
});

describe('daysBetween', () => {
  it('is whole calendar days and ignores clock changes', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // across the October clock change
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across the March clock change
    expect(daysBetween(at, at)).toBe(0);
  });
});

describe('trainingFindingTone', () => {
  it('is never "bad": a finding is evidence, not a verdict', () => {
    for (const s of TRAINING_FINDINGS) expect(trainingFindingTone(s)).not.toBe('bad');
  });
});
