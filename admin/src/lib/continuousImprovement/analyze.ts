// Continuous Improvement (go-live gap list, item 8).
//
// "Are we getting better?" is a genuinely different question from any
// existing dashboard: the Digital Twin/Core 360 Status/Assurance Today
// family all answer "what is true right now"; Incident Pattern
// Intelligence answers "what keeps happening"; this composes three
// ALREADY-COMPUTED facts into one period-over-period trend view —
// never a new raw fact, never a score, never AI. No stored aggregate:
// computed at read time from a window's already-fetched rows, the
// same posture every intelligence module in this codebase already
// takes.
//
// Reuses `analyzeIncidentPatterns()` (Phase 10) VERBATIM for the
// recurring-root-cause signal rather than re-implementing the exact
// same grouping logic a second time against the same source table —
// the "REUSE, never a parallel system" rule this codebase has followed
// since Phase 4's own existing-operations audit.

import {
  analyzeIncidentPatterns,
  incidentPatternWindows,
  clampWindowDays,
  type IncidentPatternInput,
  type RecurringCause,
} from '../incidentPatterns/analyze';

export { incidentPatternWindows, clampWindowDays };

export interface AuditFindingRow {
  id: string;
  severity: 'minor' | 'major' | 'critical';
  created_at: string;
  closed_at: string | null;
}

export type ObjectiveStatus = 'draft' | 'active' | 'on_track' | 'at_risk' | 'achieved' | 'missed' | 'abandoned';

export interface ObjectiveRow {
  id: string;
  status: ObjectiveStatus;
}

export interface ContinuousImprovementInput {
  windowStart: string;
  windowEndExclusive: string;
  priorStart: string;
  priorEndExclusive: string;
  auditFindings: AuditFindingRow[];
  objectives: ObjectiveRow[];
  incidentPatternInput: IncidentPatternInput;
}

export interface AuditFindingsTrend {
  currentWindow: { raised: number; closed: number; avgDaysToCloseClosed: number | null };
  priorWindow: { raised: number; closed: number };
  /** Point-in-time, not window-scoped: how many findings are open RIGHT NOW. */
  openNow: number;
}

export interface ObjectivesSummary {
  byStatus: Record<ObjectiveStatus, number>;
  /** (on_track + achieved) / (active + on_track + at_risk + achieved + missed).
   *  null when that denominator is zero — "no in-flight objectives" is
   *  a different fact from "0% healthy", the same null-vs-zero
   *  distinction this codebase draws throughout (Evidence Coverage,
   *  lib/hs/kpis.ts). draft/abandoned are excluded: neither is
   *  currently being pursued. */
  healthyPercent: number | null;
}

export interface ContinuousImprovementSummary {
  auditFindings: AuditFindingsTrend;
  recurringRootCauses: RecurringCause[];
  objectives: ObjectivesSummary;
}

function inWindow(iso: string, start: string, endExclusive: string): boolean {
  return iso >= start && iso < endExclusive;
}

function computeAuditFindingsTrend(
  findings: AuditFindingRow[],
  windowStart: string,
  windowEndExclusive: string,
  priorStart: string,
  priorEndExclusive: string,
): AuditFindingsTrend {
  let raisedCurrent = 0, closedCurrent = 0, raisedPrior = 0, closedPrior = 0, openNow = 0;
  let closeDurationsDays: number[] = [];
  for (const f of findings) {
    if (!f.closed_at) openNow++;
    if (inWindow(f.created_at, windowStart, windowEndExclusive)) raisedCurrent++;
    else if (inWindow(f.created_at, priorStart, priorEndExclusive)) raisedPrior++;
    if (f.closed_at) {
      if (inWindow(f.closed_at, windowStart, windowEndExclusive)) {
        closedCurrent++;
        const days = (new Date(f.closed_at).getTime() - new Date(f.created_at).getTime()) / 86_400_000;
        if (days >= 0) closeDurationsDays.push(days);
      } else if (inWindow(f.closed_at, priorStart, priorEndExclusive)) {
        closedPrior++;
      }
    }
  }
  const avgDaysToCloseClosed = closeDurationsDays.length
    ? Math.round((closeDurationsDays.reduce((a, b) => a + b, 0) / closeDurationsDays.length) * 10) / 10
    : null;
  return {
    currentWindow: { raised: raisedCurrent, closed: closedCurrent, avgDaysToCloseClosed },
    priorWindow: { raised: raisedPrior, closed: closedPrior },
    openNow,
  };
}

const OBJECTIVE_STATUSES: readonly ObjectiveStatus[] = ['draft', 'active', 'on_track', 'at_risk', 'achieved', 'missed', 'abandoned'];
const IN_FLIGHT: readonly ObjectiveStatus[] = ['active', 'on_track', 'at_risk', 'achieved', 'missed'];
const HEALTHY: readonly ObjectiveStatus[] = ['on_track', 'achieved'];

function computeObjectivesSummary(objectives: ObjectiveRow[]): ObjectivesSummary {
  const byStatus = Object.fromEntries(OBJECTIVE_STATUSES.map(s => [s, 0])) as Record<ObjectiveStatus, number>;
  for (const o of objectives) byStatus[o.status]++;
  const inFlight = IN_FLIGHT.reduce((sum, s) => sum + byStatus[s], 0);
  const healthy = HEALTHY.reduce((sum, s) => sum + byStatus[s], 0);
  return { byStatus, healthyPercent: inFlight > 0 ? Math.round((healthy / inFlight) * 1000) / 10 : null };
}

export function computeContinuousImprovement(input: ContinuousImprovementInput): ContinuousImprovementSummary {
  return {
    auditFindings: computeAuditFindingsTrend(
      input.auditFindings, input.windowStart, input.windowEndExclusive, input.priorStart, input.priorEndExclusive,
    ),
    recurringRootCauses: analyzeIncidentPatterns(input.incidentPatternInput).recurringRootCauses,
    objectives: computeObjectivesSummary(input.objectives),
  };
}
