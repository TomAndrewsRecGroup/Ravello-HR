// Core-OS 360 Phase 10, Group 1: Incident Pattern Intelligence.
//
// ABSOLUTE RULE, this codebase's own standing one since Phase 4:
// "Explicitly forbidden anywhere in this phase: predictive/AI safety
// scoring — machine failure prediction, accident probability,
// unsafe-worker prediction." Every insight this module produces
// reports what has ALREADY HAPPENED, in the past tense, with a real,
// inspectable count behind it — never a risk level, a probability, or
// anything framed as "likely to happen again." No AI anywhere in this
// file. Pure, deterministic, computed at READ TIME from a window's
// already-fetched rows (the caller scopes the date window in SQL) —
// the same posture every KPI/intelligence module in this codebase
// already takes.
//
// Only NON-SENSITIVE columns are read: hs_incidents' own type/
// severity/site/department/date, and incident_causes.category (a
// curated 13-value taxonomy, never the free-text `description`).
// Nothing here ever touches incident_person_sensitive or any
// injury/medical/personal detail — checked against the schema before
// writing this file, not assumed safe.

/**
 * The date-window boundaries for a "current window" / "prior window"
 * comparison, adjacent, with no gap and no overlap. Half-open ranges
 * throughout (`>= start AND < endExclusive`), so callers never need to
 * reason about which end is inclusive.
 *
 * Found and fixed in Group 3's adversarial review: the first version
 * built the current window as `[start, today]` (INCLUSIVE both ends —
 * `days` calendar days is actually `days + 1` distinct dates when both
 * ends are inclusive) and the prior window as `[priorStart, start)`
 * (`days` days, half-open) — an off-by-one that made the "current"
 * side of the comparison one calendar day longer than the "prior"
 * side, every single time, with NO stated reason for the asymmetry.
 *
 * NOT literally equal-length after this fix, and deliberately so:
 * `windowEndExclusive` is `today + 2` rather than `today + 1`, to
 * safely include an incident dated up to `current_date + 1` — the
 * exact leeway `hs_incidents`' own CHECK constraint allows for
 * timezone rounding at the point of reporting. That makes the current
 * window `days + 1` real dates against the prior window's exact
 * `days` — one day wider, on the FUTURE end only. The prior window
 * gets no matching pad because it is already safely in the past: no
 * incident genuinely belonging to that period could ever be
 * date-stamped ahead of it. So the asymmetry here is a one-day
 * forward safety margin against undercounting today's own incidents,
 * not the unexplained, unequal-for-no-reason gap the original bug
 * was — a real, disclosed and load-bearing difference, not the
 * "provably equal-length" property a caller might otherwise assume
 * from the two windows' equal `days` parameter alone. See the test's
 * own `currentLength`/`priorLength` cases for the exact numbers.
 */
export interface IncidentPatternWindows {
  windowStart: string;
  windowEndExclusive: string;
  priorStart: string;
  priorEndExclusive: string;
}

export function incidentPatternWindows(todayISO: string, days: number): IncidentPatternWindows {
  const shift = (n: number): string => {
    const d = new Date(`${todayISO}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const windowStart = shift(-(days - 1));
  return {
    windowStart,
    windowEndExclusive: shift(2),
    priorStart: shift(-(days * 2 - 1)),
    priorEndExclusive: windowStart,
  };
}

export interface IncidentRow {
  id: string;
  incident_type: string;
  severity: string | null;
  site_id: string | null;
  department_id: string | null;
  occurred_on: string;
}

export interface IncidentCauseRow {
  investigation_id: string;
  cause_level: 'immediate' | 'underlying' | 'root';
  category: string;
  /** A cause is only counted once a human has confirmed it — an unconfirmed draft cause is not yet a recorded fact. */
  confirmed_at: string | null;
}

export interface IncidentInvestigationRow {
  id: string;
  incident_id: string;
}

export interface IncidentPatternInput {
  incidents: IncidentRow[];
  causes: IncidentCauseRow[];
  investigations: IncidentInvestigationRow[];
  /** Incidents from the immediately preceding window of the same length, for the severity comparison only. */
  priorWindowIncidents: IncidentRow[];
}

export interface TypeCount {
  incidentType: string;
  count: number;
}

export interface RecurringCause {
  category: string;
  /** How many DISTINCT incidents this confirmed root cause was recorded against. */
  incidentCount: number;
  incidentIds: string[];
}

export interface LocationCluster {
  kind: 'site' | 'department';
  id: string;
  count: number;
}

export interface SeverityComparison {
  currentWindow: { major: number; critical: number; fatal: number };
  priorWindow: { major: number; critical: number; fatal: number };
}

export interface IncidentPatternSummary {
  totalIncidents: number;
  byType: TypeCount[];
  recurringRootCauses: RecurringCause[];
  siteClusters: LocationCluster[];
  departmentClusters: LocationCluster[];
  severityComparison: SeverityComparison;
}

/** A location "cluster" is 2+ incidents in the window — a recorded historical concentration, never a risk rating. */
const CLUSTER_THRESHOLD = 2;

function countSevere(incidents: IncidentRow[]): { major: number; critical: number; fatal: number } {
  const out = { major: 0, critical: 0, fatal: 0 };
  for (const i of incidents) {
    if (i.severity === 'major') out.major++;
    else if (i.severity === 'critical') out.critical++;
    else if (i.severity === 'fatal') out.fatal++;
  }
  return out;
}

export function analyzeIncidentPatterns(input: IncidentPatternInput): IncidentPatternSummary {
  const { incidents, causes, investigations, priorWindowIncidents } = input;

  const byType = new Map<string, number>();
  const bySite = new Map<string, Set<string>>();
  const byDept = new Map<string, Set<string>>();
  for (const inc of incidents) {
    byType.set(inc.incident_type, (byType.get(inc.incident_type) ?? 0) + 1);
    if (inc.site_id) { if (!bySite.has(inc.site_id)) bySite.set(inc.site_id, new Set()); bySite.get(inc.site_id)!.add(inc.id); }
    if (inc.department_id) { if (!byDept.has(inc.department_id)) byDept.set(inc.department_id, new Set()); byDept.get(inc.department_id)!.add(inc.id); }
  }
  const incidentIdsInWindow = new Set(incidents.map(i => i.id));

  const investigationToIncident = new Map(investigations.map(v => [v.id, v.incident_id]));
  const byCategory = new Map<string, Set<string>>();
  for (const c of causes) {
    if (c.cause_level !== 'root' || !c.confirmed_at) continue;
    const incidentId = investigationToIncident.get(c.investigation_id);
    // Only count a cause against an incident that ITSELF falls inside
    // the chosen window — an investigation completed later, for an
    // incident outside the window, must not inflate this window's count.
    if (!incidentId || !incidentIdsInWindow.has(incidentId)) continue;
    if (!byCategory.has(c.category)) byCategory.set(c.category, new Set());
    byCategory.get(c.category)!.add(incidentId);
  }

  const byTypeSorted: TypeCount[] = [...byType.entries()]
    .map(([incidentType, count]) => ({ incidentType, count }))
    .sort((a, b) => b.count - a.count || a.incidentType.localeCompare(b.incidentType));

  const recurringRootCauses: RecurringCause[] = [...byCategory.entries()]
    .filter(([, ids]) => ids.size >= CLUSTER_THRESHOLD)
    .map(([category, ids]) => ({ category, incidentCount: ids.size, incidentIds: [...ids] }))
    .sort((a, b) => b.incidentCount - a.incidentCount || a.category.localeCompare(b.category));

  const siteClusters: LocationCluster[] = [...bySite.entries()]
    .filter(([, ids]) => ids.size >= CLUSTER_THRESHOLD)
    .map(([id, ids]) => ({ kind: 'site' as const, id, count: ids.size }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  const departmentClusters: LocationCluster[] = [...byDept.entries()]
    .filter(([, ids]) => ids.size >= CLUSTER_THRESHOLD)
    .map(([id, ids]) => ({ kind: 'department' as const, id, count: ids.size }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  return {
    totalIncidents: incidents.length,
    byType: byTypeSorted,
    recurringRootCauses,
    siteClusters,
    departmentClusters,
    severityComparison: {
      currentWindow: countSevere(incidents),
      priorWindow: countSevere(priorWindowIncidents),
    },
  };
}
