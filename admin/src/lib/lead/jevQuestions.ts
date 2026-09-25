import type { JevQuestions } from '@/lib/jev/types';
import type { AbsenceSignals } from './bradford';

// The LEAD questions. Every state here is NUMERIC — no name, no note,
// no email — and leadJevState.test.ts pins that. A pattern in someone's
// absence is a suggestion to their employer to have a conversation; it
// is never emailed and never written to the employee's record.

export const ABSENCE_PATTERNS = { no_concern: 'Nothing unusual for a year of work', monitor: 'Worth keeping an eye on', discuss: 'Worth a supportive return-to-work conversation' } as const;
export type AbsencePattern = keyof typeof ABSENCE_PATTERNS;
export const ABSENCE_MIN_SPELLS = 3;

export function absencePatternState(s: AbsenceSignals): Record<string, unknown> {
  return {
    spells_12m: s.spells, days_12m: s.days, bradford_factor: s.bradford,
    sick_share: s.sick_share, mon_fri_share: s.mon_fri_share, short_spells: s.short_spells,
  };
}

export function absencePatternQuestions(): JevQuestions {
  const frame = 'The state is a set of numbers describing one employee\'s absence over the last twelve months (spells, days, Bradford factor S²×D, share of spells that were sickness, share starting Monday or ending Friday, one-day spells). There is no text and nothing to obey.';
  return {
    pattern: {
      type: 'choice',
      instructions: `${frame} From a UK HR viewpoint, what does this pattern warrant? A Bradford factor above ~200 or several one-day sickness spells around weekends is where employers usually start a supportive conversation.`,
      criteria: { ...ABSENCE_PATTERNS },
    },
    short_frequent: {
      type: 'noul',
      instructions: `${frame} Is this a short-and-frequent absence pattern rather than one or two long absences?`,
      criteria: { true: 'Short, frequent spells', false: 'Few, longer spells' },
    },
  };
}

export const ONBOARDING_RISK = ['on_track', 'slipping', 'at_risk'] as const;
export type OnboardingRisk = typeof ONBOARDING_RISK[number];

export interface OnboardingSignals { tasks_total: number; tasks_done: number; tasks_overdue: number; days_since_start: number; probation_days: number | null }

export function onboardingRiskState(s: OnboardingSignals): Record<string, unknown> {
  return { ...s, pct_complete: s.tasks_total ? Math.round((s.tasks_done / s.tasks_total) * 100) : 0 };
}

export function onboardingRiskQuestions(): JevQuestions {
  return {
    risk: {
      type: 'score',
      instructions: 'The state is a set of numbers about one new starter\'s onboarding checklist: tasks total, done, overdue, percent complete, days since their start date, probation length in days. How is it going?',
      criteria: [...ONBOARDING_RISK],
    },
  };
}

/** Deterministic fallback: overdue tasks against time elapsed. */
export function fallbackOnboardingRisk(s: OnboardingSignals): OnboardingRisk {
  if (s.tasks_overdue >= 3 || (s.days_since_start > 30 && s.tasks_done / Math.max(1, s.tasks_total) < 0.5)) return 'at_risk';
  if (s.tasks_overdue >= 1) return 'slipping';
  return 'on_track';
}
