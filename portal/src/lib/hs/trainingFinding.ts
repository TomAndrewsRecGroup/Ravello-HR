import { fmtDate } from '@/lib/hs/safetyFormat';
import { TRAINING_FINDING_LABELS, type TrainingFinding } from '@/lib/hs/safetyVocab';
import type { Tone } from '@/components/safety/Pill';

// Incident → training (spec 59): turn a training finding into the
// factual sentence an investigator reads, e.g.
//   "Completed 3 Mar 2024 · expired 14 days before the incident".
// Statements of fact about the record on the incident date only — no
// word here says the training caused, contributed to or was relevant to
// the incident. That judgement is the investigator's, recorded as a
// cause in the investigation. No server imports: safe in client code.

export interface TrainingFindingInput {
  status_at_incident: TrainingFinding;
  completed_on: string | null;
  expires_on: string | null;
  incident_date: string;
}

/** Whole calendar days from a to b (b − a), on ISO dates. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export function trainingFindingText(f: TrainingFindingInput): string {
  const done = f.completed_on ? `Completed ${fmtDate(f.completed_on)}` : null;
  switch (f.status_at_incident) {
    case 'not_recorded':
      return 'No completion on record';
    case 'no_expiry':
      return `${done} · no expiry`;
    case 'completed_after': {
      const n = daysBetween(f.incident_date, f.completed_on!);
      return `${done} · ${n === 0 ? 'on the day of the incident, after it' : `${days(n)} after the incident`}`;
    }
    case 'expired': {
      const n = daysBetween(f.expires_on!, f.incident_date);
      return `${done} · expired ${days(n)} before the incident`;
    }
    case 'current': {
      const n = daysBetween(f.incident_date, f.expires_on!);
      return `${done} · in date, valid until ${fmtDate(f.expires_on)}${n === 0 ? ' (the day of the incident)' : ` (${days(n)} after the incident)`}`;
    }
  }
}

/** The status word for a pill. Deliberately never "bad": a fact, not a verdict. */
export function trainingFindingTone(s: TrainingFinding): Tone {
  return s === 'current' || s === 'no_expiry' ? 'good' : s === 'not_recorded' ? 'muted' : 'warn';
}

export const trainingFindingLabel = (s: TrainingFinding) => TRAINING_FINDING_LABELS[s];
