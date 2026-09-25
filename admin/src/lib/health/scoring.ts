// Client health scoring: pure functions extracted from /health's
// bandForClient and /engagement's inline score formula so the daily
// snapshot cron computes EXACTLY what the two pages already show —
// one vocabulary, not a copy that could drift the way statusMaps.ts
// exists to prevent for enum vocabularies.

export interface HealthBandInput {
  active: boolean;
  overdue_comp: number;
  open_tickets: number;
  stalled_reqs: number;
}
export type HealthBand = 'green' | 'amber' | 'red';

export function computeBand(h: HealthBandInput): HealthBand {
  if (!h.active) return 'red';
  if (h.overdue_comp >= 3 || h.open_tickets >= 3 || h.stalled_reqs >= 2) return 'red';
  if (h.overdue_comp > 0 || h.open_tickets > 0 || h.stalled_reqs > 0) return 'amber';
  return 'green';
}

export interface EngagementScoreInput {
  daysSinceLogin: number; // 999 = never logged in
  activeRoles: number;
  recentReqs: number;
  recentTickets: number;
  docCount: number;
  loginCount30d: number;
}

export function computeEngagementScore(i: EngagementScoreInput): number {
  let score = 50;
  // Order matters: the >60 branch must be checked BEFORE >30, or it is
  // unreachable dead code (every value past 60 is already past 30) —
  // exactly the defect the original inline formula on /engagement had,
  // where nobody had ever been penalised the full -35 for 60+ days
  // dormant, only ever the milder -20.
  if (i.daysSinceLogin <= 7) score += 20;
  else if (i.daysSinceLogin <= 14) score += 10;
  else if (i.daysSinceLogin > 60) score -= 35;
  else if (i.daysSinceLogin > 30) score -= 20;
  if (i.activeRoles > 0) score += 10;
  if (i.recentReqs > 0) score += 5;
  if (i.recentTickets > 0) score += 5;
  if (i.docCount > 0) score += 5;
  if (i.loginCount30d > 5) score += 5;
  return Math.max(0, Math.min(100, score));
}

export interface Snapshot { snapshot_date: string; band: HealthBand; engagement_score: number }

export interface ChurnSignal {
  /** How many of the most recent consecutive snapshots are non-green. */
  decliningStreak: number;
  /** Current score minus the score ~7 days ago (nearest snapshot at or
   *  before that date), or null when there isn't one that old yet. */
  scoreDelta7d: number | null;
  /** True when either signal crosses the early-warning threshold. */
  atRisk: boolean;
}

const STREAK_THRESHOLD = 3;
const DROP_THRESHOLD = -15;

/** `snapshots` must be sorted MOST RECENT FIRST. Pure — the cron never
 *  calls this; only the page does, so the flag is always computed
 *  against whatever the reader currently has, never persisted. */
export function computeChurnSignal(snapshots: readonly Snapshot[]): ChurnSignal {
  let decliningStreak = 0;
  for (const s of snapshots) {
    if (s.band === 'green') break;
    decliningStreak++;
  }

  let scoreDelta7d: number | null = null;
  if (snapshots.length > 0) {
    const current = snapshots[0];
    const currentDate = new Date(currentDate_(current.snapshot_date));
    const sevenDaysAgo = new Date(currentDate.getTime() - 7 * 86_400_000);
    // Nearest snapshot AT OR BEFORE seven days ago, closest first
    // (snapshots is sorted newest-first, so scan from the end forward
    // is wrong; scan from the point where dates drop below the cutoff).
    const older = snapshots.find(s => new Date(currentDate_(s.snapshot_date)) <= sevenDaysAgo);
    if (older) scoreDelta7d = current.engagement_score - older.engagement_score;
  }

  const atRisk = decliningStreak >= STREAK_THRESHOLD || (scoreDelta7d !== null && scoreDelta7d <= DROP_THRESHOLD);
  return { decliningStreak, scoreDelta7d, atRisk };
}

function currentDate_(d: string): string {
  return d.length === 10 ? `${d}T00:00:00Z` : d;
}
