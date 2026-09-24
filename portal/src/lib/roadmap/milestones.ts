// The ONE vocabulary for `milestones` rows, shared byte-for-byte by
// admin and portal (scripts/check-shared-dupes.sh).
//
// Until 2026-09-24 three screens spoke three dialects of one table:
//   • admin client Roadmap tab WROTE pillar 'HIRE', quarter 'Q2 2026',
//     status 'Not Started' / 'Blocked', owner fixed to 'Lucy' | 'Tom'
//   • portal People Roadmap READ pillar 'hire', quarter 'Q2-2026',
//     status 'not_started' / 'at_risk' (the DB default is 'not_started')
//   • admin cross-client Roadmap READ a `track` column that does not
//     exist, so the whole query failed and the page rendered empty
// A milestone added in admin therefore could never appear to the client.
// The canonical form is the portal's, because it matches the DB default
// and migration 087's CHECK constraints now refuse anything else.

export const MILESTONE_PILLARS = ['hire', 'lead', 'protect'] as const;
export type MilestonePillar = typeof MILESTONE_PILLARS[number];

export const MILESTONE_PILLAR_LABELS: Record<MilestonePillar, string> = {
  hire:    'HIRE',
  lead:    'LEAD',
  protect: 'PROTECT',
};

export const MILESTONE_STATUSES = ['not_started', 'in_progress', 'complete', 'at_risk'] as const;
export type MilestoneStatus = typeof MILESTONE_STATUSES[number];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete:    'Complete',
  at_risk:     'At risk',
};

/** Canonical quarter key: 'Q3-2026'. */
export function quarterKey(year: number, quarter: number): string {
  return `Q${quarter}-${year}`;
}

export function quarterOf(d: Date): string {
  return quarterKey(d.getFullYear(), Math.ceil((d.getMonth() + 1) / 3));
}

const QUARTER_RE = /^Q([1-4])[-\s](\d{4})$/;

/** 'Q3-2026' → 'Q3 2026'. Unrecognised input is returned unchanged. */
export function quarterLabel(key: string): string {
  const m = QUARTER_RE.exec(key);
  return m ? `Q${m[1]} ${m[2]}` : key;
}

/** Sortable number for a quarter key; unrecognised sorts last. */
export function quarterOrdinal(key: string): number {
  const m = QUARTER_RE.exec(key);
  return m ? Number(m[2]) * 4 + Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** The quarters a milestone can be planned in: `before` quarters back
 *  to `after` quarters ahead of `from`. No hardcoded year to go stale. */
export function quarterOptions(from: Date, before = 1, after = 6): { value: string; label: string }[] {
  const base = from.getFullYear() * 4 + Math.ceil((from.getMonth() + 1) / 3) - 1;
  const out: { value: string; label: string }[] = [];
  for (let i = base - before; i <= base + after; i++) {
    const key = quarterKey(Math.floor(i / 4), (i % 4) + 1);
    out.push({ value: key, label: quarterLabel(key) });
  }
  return out;
}
