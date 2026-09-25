import { describe, expect, it } from 'vitest';
import { absenceSignals, spellDays } from '../bradford';
import {
  ABSENCE_PATTERNS, absencePatternQuestions, absencePatternState, fallbackOnboardingRisk,
  ONBOARDING_RISK, onboardingRiskQuestions, onboardingRiskState,
} from '../jevQuestions';

// The LEAD decisions are made from NUMBERS. A name, a note or an
// email in the state would be a person's health information leaving
// the platform for a classifier; these pin that no string ever does.

const spells = [
  { start_date: '2026-09-07', end_date: '2026-09-07', days: 1,    absence_type: 'sick' },       // Monday
  { start_date: '2026-09-18', end_date: null,         days: null, absence_type: 'sick' },       // Friday, one day
  { start_date: '2026-08-04', end_date: '2026-08-15', days: null, absence_type: 'holiday' },    // 12 days, Tue–Sat
  { start_date: '2026-06-10', end_date: '2026-06-10', days: 0.5,  absence_type: 'compassionate' },
];

describe('absenceSignals', () => {
  it('counts spells, days (inclusive span when blank), the Bradford factor, and the shares', () => {
    expect(spellDays(spells[1])).toBe(1);
    expect(spellDays(spells[2])).toBe(12);
    expect(spellDays(spells[3])).toBe(0.5);
    const s = absenceSignals(spells);
    expect(s).toEqual({ spells: 4, days: 14.5, bradford: 4 * 4 * 15, sick_share: 0.5, mon_fri_share: 0.5, short_spells: 3 });
  });
  it('is all zeros for nobody', () => {
    expect(absenceSignals([])).toEqual({ spells: 0, days: 0, bradford: 0, sick_share: 0, mon_fri_share: 0, short_spells: 0 });
  });
});

describe('the state that reaches Jev', () => {
  it('absence: every value is a finite number — no name, note, email or date', () => {
    const state = absencePatternState(absenceSignals(spells));
    expect(Object.keys(state).sort()).toEqual(['bradford_factor', 'days_12m', 'mon_fri_share', 'short_spells', 'sick_share', 'spells_12m']);
    for (const [k, v] of Object.entries(state)) expect(typeof v === 'number' && Number.isFinite(v), k).toBe(true);
  });
  it('onboarding: every value is a number or null', () => {
    const state = onboardingRiskState({ tasks_total: 8, tasks_done: 3, tasks_overdue: 2, days_since_start: 20, probation_days: null });
    expect(state).toEqual({ tasks_total: 8, tasks_done: 3, tasks_overdue: 2, days_since_start: 20, probation_days: null, pct_complete: 38 });
    for (const v of Object.values(state)) expect(v === null || typeof v === 'number').toBe(true);
  });
  it('the questions are fixed text: they take no input and name the option vocabularies', () => {
    const a = absencePatternQuestions();
    expect(Object.keys(a)).toEqual(['pattern', 'short_frequent']);
    expect(a.pattern.type).toBe('choice');
    expect(Object.keys(a.pattern.criteria as object)).toEqual(Object.keys(ABSENCE_PATTERNS));
    const o = onboardingRiskQuestions();
    expect(o.risk.type).toBe('score');
    expect(o.risk.criteria).toEqual([...ONBOARDING_RISK]);
  });
});

describe('fallbackOnboardingRisk', () => {
  it('reads overdue tasks against time elapsed', () => {
    expect(fallbackOnboardingRisk({ tasks_total: 5, tasks_done: 2, tasks_overdue: 0, days_since_start: 10, probation_days: 90 })).toBe('on_track');
    expect(fallbackOnboardingRisk({ tasks_total: 5, tasks_done: 2, tasks_overdue: 1, days_since_start: 10, probation_days: 90 })).toBe('slipping');
    expect(fallbackOnboardingRisk({ tasks_total: 5, tasks_done: 2, tasks_overdue: 3, days_since_start: 10, probation_days: 90 })).toBe('at_risk');
    expect(fallbackOnboardingRisk({ tasks_total: 5, tasks_done: 1, tasks_overdue: 0, days_since_start: 40, probation_days: 90 })).toBe('at_risk');
    expect(fallbackOnboardingRisk({ tasks_total: 5, tasks_done: 4, tasks_overdue: 0, days_since_start: 40, probation_days: 90 })).toBe('on_track');
  });
});
