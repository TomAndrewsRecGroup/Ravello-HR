// The Bradford factor: S² × D over a rolling window, where S is the
// number of separate absence spells and D the total days. It weights
// frequency over length — ten one-day absences score 1,000; one
// ten-day absence scores 10 — which is why it is the standard signal
// for short, frequent sickness absence. Deterministic; Jev is only
// asked to interpret the numbers, never to compute them.

export interface Spell { start_date: string; end_date: string | null; days: number | null; absence_type: string }

export interface AbsenceSignals {
  spells: number;
  days: number;
  bradford: number;
  sick_share: number;        // fraction of spells that were sickness
  mon_fri_share: number;     // fraction of spells starting Monday or ending Friday
  short_spells: number;      // spells of 1 day or less
}

const dayOfWeek = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();

export function spellDays(s: Spell): number {
  if (s.days != null && s.days > 0) return s.days;
  if (!s.end_date) return 1;
  const d = (Date.parse(`${s.end_date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${s.start_date.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  return Math.max(1, d + 1);
}

export function absenceSignals(spells: Spell[]): AbsenceSignals {
  const n = spells.length;
  const days = spells.reduce((t, s) => t + spellDays(s), 0);
  const sick = spells.filter(s => s.absence_type === 'sick' || s.absence_type === 'sick_day').length;
  const monFri = spells.filter(s => dayOfWeek(s.start_date) === 1 || dayOfWeek(s.end_date ?? s.start_date) === 5).length;
  const short = spells.filter(s => spellDays(s) <= 1).length;
  return {
    spells: n, days: Math.round(days * 10) / 10, bradford: n * n * Math.round(days),
    sick_share: n ? Math.round((sick / n) * 100) / 100 : 0,
    mon_fri_share: n ? Math.round((monFri / n) * 100) / 100 : 0,
    short_spells: short,
  };
}
