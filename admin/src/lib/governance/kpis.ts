// Core-OS 360 Phase 5, Group 8: environmental / governance KPIs.
//
// Sibling to lib/hs/kpis.ts (Phase 4's computeHsKpis) rather than an
// extension of it: that module's incident/audit/equipment counts are
// pure H&S register signals; this one spans Environmental, the Legal
// Register and Objectives — the same "own file for cross-pillar
// content" call environmentalRules.ts / legalRegisterRules.ts /
// governanceRules.ts already made for consequence rules. Pure,
// deterministic, computed at READ TIME from existing rows — no stored
// aggregate, no AI, no significance judgement, the exact posture
// lib/hs/kpis.ts and lib/health/scoring.ts already take.
//
// "Waste diverted %" was named as an EXAMPLE KPI in the brief, but
// waste_streams.typical_disposal_route (157) is free text with no
// diverted/landfill classification — string-matching it (e.g. for
// "recycl") would be exactly the kind of guessed default this
// codebase's own standing rule rejects (see lib/bd/score.ts: "an
// honest degrade... not a guessed default"). wasteNonConformancePercent
// is used instead: it is honestly computable from waste_movements'
// own `non_conformance` boolean and is a real, standard EHS metric
// (consignment/handling errors), not a substitute invented to look
// complete.

export interface GovernanceKpiWasteMovement {
  non_conformance: boolean;
  moved_at: string;
}
export interface GovernanceKpiObjective {
  status: string;
}
export interface GovernanceKpiLegalObligation {
  applicability_status: string;
  next_review_due: string | null;
}

export interface GovernanceKpiInput {
  /** Any hs_incidents row in the trailing 12 months — H&S and environmental alike. */
  incidentsLast12MonthsCount: number;
  /** Active headcount today (employee_records with no end_date, or end_date in the future). */
  activeEmployeeCount: number;
  wasteMovements: GovernanceKpiWasteMovement[];
  objectives: GovernanceKpiObjective[];
  legalObligations: GovernanceKpiLegalObligation[];
  /** Today, as YYYY-MM-DD. Injected so this is testable without a clock. */
  today: string;
}

export interface GovernanceKpiDataSource {
  incidentFrequencyRatePer100: string;
  wasteNonConformancePercent: string;
  objectivesOnTrackPercent: string;
  overdueLegalEvaluationsCount: string;
}

export interface GovernanceKpis {
  /** Recordable incidents per 100 active employees, trailing 12 months. Null with no active employees. */
  incidentFrequencyRatePer100: number | null;
  /** Share of recorded waste movements flagged non_conformance. Null with no movements recorded. */
  wasteNonConformancePercent: number | null;
  /** Share of non-draft, non-abandoned objectives currently on_track or achieved. Null with no such objectives. */
  objectivesOnTrackPercent: number | null;
  /** Count of 'applicable' legal obligations whose own next_review_due has passed. */
  overdueLegalEvaluationsCount: number;
  /** Which tables/columns/date-range each KPI came from — never stored, computed alongside the numbers. */
  dataSource: GovernanceKpiDataSource;
}

const DATA_SOURCE: GovernanceKpiDataSource = {
  incidentFrequencyRatePer100:
    'hs_incidents (any incident_type) in the trailing 12 months, ÷ active employee_records ÷ 100',
  wasteNonConformancePercent:
    'waste_movements.non_conformance, all recorded movements (this table has no per-movement date window applied)',
  objectivesOnTrackPercent:
    "objectives.status, excluding 'draft' and 'abandoned'",
  overdueLegalEvaluationsCount:
    "organisation_legal_obligations where applicability_status = 'applicable' and next_review_due < today",
};

const ON_TRACK_STATUSES = new Set(['on_track', 'achieved']);
const EXCLUDED_OBJECTIVE_STATUSES = new Set(['draft', 'abandoned']);

export function computeGovernanceKpis(input: GovernanceKpiInput): GovernanceKpis {
  const { incidentsLast12MonthsCount, activeEmployeeCount, wasteMovements, objectives, legalObligations, today } = input;

  const incidentFrequencyRatePer100 = activeEmployeeCount > 0
    ? (incidentsLast12MonthsCount / activeEmployeeCount) * 100
    : null;

  const wasteNonConformancePercent = wasteMovements.length > 0
    ? (wasteMovements.filter(w => w.non_conformance).length / wasteMovements.length) * 100
    : null;

  const countedObjectives = objectives.filter(o => !EXCLUDED_OBJECTIVE_STATUSES.has(o.status));
  const objectivesOnTrackPercent = countedObjectives.length > 0
    ? (countedObjectives.filter(o => ON_TRACK_STATUSES.has(o.status)).length / countedObjectives.length) * 100
    : null;

  const overdueLegalEvaluationsCount = legalObligations.filter(
    o => o.applicability_status === 'applicable' && o.next_review_due != null && o.next_review_due < today,
  ).length;

  return {
    incidentFrequencyRatePer100,
    wasteNonConformancePercent,
    objectivesOnTrackPercent,
    overdueLegalEvaluationsCount,
    dataSource: DATA_SOURCE,
  };
}
