// Operational Exception Detection (go-live gap list, item 10).
//
// Flagged by the survey as potentially conflicting with this
// codebase's own absolute, repeatedly-stated rule: "no AI, no
// scores, no prediction anywhere." A literal reading of "exception
// detection" as statistical/ML anomaly detection (z-scores, outlier
// models) would be a genuine, first-of-its-kind departure from that
// rule. Scoped instead, per the decision already recorded in
// CLAUDE.md, as DETERMINISTIC CROSS-SIGNAL CORRELATION: several
// independent, already-computed, fixed-threshold facts co-occurring
// on the SAME record. No AI, no score, no stored aggregate — computed
// at read time from already-live facts, the same posture every
// "intelligence" module in this codebase takes.
//
// Every signal here is read verbatim from an existing table/RPC this
// codebase already computes correctly on its own terms — never a new
// raw fact invented for this module:
//   - person status: workforce_matrix()/person_deployment_status()
//     (Phase 3's own Safe to Deploy engine, the ONE public read).
//   - stale check-in: site_checkins, the exact "checked in on a
//     previous calendar day and never checked out" definition the
//     existing reminders rule (lib/reminders/rules.ts, Phase 26 Group
//     3) already uses — recomputed here at read time, not duplicated
//     logic with a different threshold.
//   - asset status / overdue inspection: hs_equipment, the same
//     next_inspection_due < today threshold lib/hs/kpis.ts already
//     uses for its own equipmentOverdueCount.
//   - open isolation / open permit: isolations.status = 'applied'
//     (not yet verified removed) / permits.status IN ('issued',
//     'suspended') (currently live), both read directly off the
//     asset's own linking column.
//
// The THRESHOLD for "an exception" is itself fixed and named: 2 or
// more independent signals true on the same record at once. A single
// flagged fact alone is routine — that's what the Register, the
// Equipment tab and the workforce dashboard already show. What none
// of them show is the SAME person or asset carrying two or more
// unrelated problems simultaneously, which is the compound situation
// actually worth a human's attention right now.

export type PersonExceptionSignal = 'not_ready' | 'stale_checkin';
export type AssetExceptionSignal = 'unavailable' | 'overdue_inspection' | 'open_isolation' | 'open_permit';

export const PERSON_EXCEPTION_SIGNAL_LABELS: Record<PersonExceptionSignal, string> = {
  not_ready: 'Not cleared to work (Safe to Deploy)',
  stale_checkin: 'Still checked in from a previous day, never checked out',
};

export const ASSET_EXCEPTION_SIGNAL_LABELS: Record<AssetExceptionSignal, string> = {
  unavailable: 'Quarantined or out of service',
  overdue_inspection: 'Inspection overdue',
  open_isolation: 'An isolation is still applied, not yet verified removed',
  open_permit: 'An issued or suspended permit still names this asset',
};

export interface PersonStatusRow {
  personId: string;
  fullName: string;
  /** The Safe to Deploy engine's own status string (READY | NOT_READY | REVIEW_REQUIRED | CONDITIONALLY_READY). */
  status: string;
}

export interface StaleCheckinRow {
  personId: string;
}

export type AssetStatus = 'in_service' | 'out_of_service' | 'decommissioned' | 'quarantined';

export interface AssetRow {
  id: string;
  name: string;
  status: AssetStatus;
  nextInspectionDue: string | null;
}

export interface AssetRefRow {
  assetId: string | null;
}

export interface OperationalExceptionsInput {
  /** ISO date (YYYY-MM-DD). */
  today: string;
  people: PersonStatusRow[];
  /** Already filtered to open, previous-day-or-earlier check-ins — see the header comment. */
  staleCheckins: StaleCheckinRow[];
  /** Decommissioned assets may be included harmlessly — nothing here ever flags one as "unavailable", and an isolation/permit cannot legally reference one once retired. */
  assets: AssetRow[];
  /** Already filtered to status = 'applied'. */
  openIsolations: AssetRefRow[];
  /** Already filtered to status IN ('issued', 'suspended'). */
  openPermits: AssetRefRow[];
}

export interface PersonException {
  entityType: 'person';
  personId: string;
  label: string;
  signals: PersonExceptionSignal[];
}

export interface AssetException {
  entityType: 'asset';
  assetId: string;
  label: string;
  signals: AssetExceptionSignal[];
}

export interface OperationalExceptionsSummary {
  personExceptions: PersonException[];
  assetExceptions: AssetException[];
}

const EXCEPTION_THRESHOLD = 2;

function sortBySignalCountThenLabel<T extends { signals: unknown[]; label: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.signals.length - a.signals.length || a.label.localeCompare(b.label));
}

export function computeOperationalExceptions(input: OperationalExceptionsInput): OperationalExceptionsSummary {
  const staleSet = new Set(input.staleCheckins.map(r => r.personId));

  const personExceptions: PersonException[] = [];
  for (const p of input.people) {
    const signals: PersonExceptionSignal[] = [];
    if (p.status !== 'READY') signals.push('not_ready');
    if (staleSet.has(p.personId)) signals.push('stale_checkin');
    if (signals.length >= EXCEPTION_THRESHOLD) {
      personExceptions.push({ entityType: 'person', personId: p.personId, label: p.fullName, signals });
    }
  }

  const isolationAssetIds = new Set(input.openIsolations.map(r => r.assetId).filter((x): x is string => !!x));
  const permitAssetIds = new Set(input.openPermits.map(r => r.assetId).filter((x): x is string => !!x));

  const assetExceptions: AssetException[] = [];
  for (const a of input.assets) {
    const signals: AssetExceptionSignal[] = [];
    if (a.status === 'quarantined' || a.status === 'out_of_service') signals.push('unavailable');
    if (a.nextInspectionDue && a.nextInspectionDue < input.today) signals.push('overdue_inspection');
    if (isolationAssetIds.has(a.id)) signals.push('open_isolation');
    if (permitAssetIds.has(a.id)) signals.push('open_permit');
    if (signals.length >= EXCEPTION_THRESHOLD) {
      assetExceptions.push({ entityType: 'asset', assetId: a.id, label: a.name, signals });
    }
  }

  return {
    personExceptions: sortBySignalCountThenLabel(personExceptions),
    assetExceptions: sortBySignalCountThenLabel(assetExceptions),
  };
}
