// Core-OS 360 Phase 9, Group 1: "What Changed?" Daily Operational
// Intelligence.
//
// platform_events (096) has recorded every create/update/delete across
// 51+ tables since 2026-09-25, purely as automation fuel for the
// consequence-rule consumer. Nothing anywhere has ever rendered it as
// a human-readable narrative — this is that. Pure, deterministic,
// computed at READ TIME from a day's already-fetched rows (the caller
// scopes the date range in SQL; this function only groups and labels
// what it is given) — no stored aggregate, no AI, no significance
// judgement, the same posture every KPI/intelligence module in this
// codebase already takes.
//
// COUNTS ONLY, deliberately, not an itemised feed. Each table's own
// outbox trigger whitelists a DIFFERENT set of columns (hazards:
// reference/status/site_id/...; actions: a different set entirely) —
// there is no single field ("title", "name") reliably present across
// entity types to build a per-item label from, and guessing one per
// table would be exactly the "sniff a payload key and hope" fragility
// this codebase's own standing rules reject elsewhere. A categorised
// count ("3 hazards created, 1 updated") is a complete, honest answer
// to "what changed" on its own.

// event_type is NOT only 'created'/'updated'/'deleted' — checked, not
// assumed, during Group 3's adversarial review. lib/reminders/run.ts
// upserts a FOURTH real value, 'reminder', directly into this table for
// every due-date bucket it fires (due_30/due_7/due_0/overdue/…). The
// first version of this module counted every row into `total` but only
// ever incremented created/updated/deleted — a day with reminder rows
// showed a total that didn't match the sum of its own breakdown
// columns, and the reminders themselves were invisible. emitEvent()
// (the other direct writer, for entities with no row of their own) is
// typed to the three CRUD values only, so 'reminder' is the one other
// value that can actually appear.
export interface PlatformEventRow {
  entity_type: string;
  event_type: 'created' | 'updated' | 'deleted' | 'reminder';
  actor_kind: string;
}

export interface ChangeCategory {
  entityType: string;
  label: string;
  created: number;
  updated: number;
  deleted: number;
  reminders: number;
  total: number;
}

export interface WhatChangedSummary {
  day: string;
  totalEvents: number;
  /** Sorted by total descending, entityType ascending as a tiebreak — deterministic, never insertion-order-dependent. */
  categories: ChangeCategory[];
  /** How many events were system-actored (crons, triggers) vs a real person acting. */
  systemActorCount: number;
  humanActorCount: number;
}

// The ~20 most operationally interesting entity types, hand-labelled.
// Everything else falls back to humaniseTableName() — readable, never
// crashes on an unlisted table, a disclosed scope choice (docs/
// CORE_OS_360_PHASE9_PLAN.md), not a silently incomplete one.
const LABELS: Record<string, string> = {
  hazards: 'Hazards',
  risk_assessments: 'Risk assessments',
  method_statements: 'Method statements',
  coshh_assessments: 'COSHH assessments',
  hs_incidents: 'Incidents',
  incident_investigations: 'Investigations',
  actions: 'Actions',
  requisitions: 'Roles',
  candidates: 'Candidates',
  offers: 'Offers',
  documents: 'Documents',
  hs_documents: 'H&S documents',
  compliance_items: 'Register items',
  hs_audits: 'Audits',
  permits: 'Permits',
  isolations: 'Isolations',
  emergency_plans: 'Emergency plans',
  environmental_aspects: 'Environmental aspects',
  environmental_spills: 'Spills',
  environmental_permits: 'Environmental permits',
  contractors: 'Contractors',
  training_records: 'Training records',
  service_requests: 'Service requests',
  absence_records: 'Absence records',
  performance_reviews: 'Performance reviews',
};

// Deliberately does NOT attempt to singularise ("companies" -> a naive
// trailing-'s' strip gives "companie", not "company") — English
// pluralisation is irregular enough that getting it wrong looks worse
// than leaving the table name's own plural form as-is. Every curated
// LABELS entry above is already written in its own correct plural
// form for exactly this reason — the fallback matches that style
// rather than trying to be cleverer than it can reliably be.
function humaniseTableName(table: string): string {
  const words = table.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelForEntityType(entityType: string): string {
  return LABELS[entityType] ?? humaniseTableName(entityType);
}

export function computeWhatChanged(events: PlatformEventRow[], day: string): WhatChangedSummary {
  const byType = new Map<string, ChangeCategory>();
  let systemActorCount = 0;
  let humanActorCount = 0;

  for (const e of events) {
    let cat = byType.get(e.entity_type);
    if (!cat) {
      cat = { entityType: e.entity_type, label: labelForEntityType(e.entity_type), created: 0, updated: 0, deleted: 0, reminders: 0, total: 0 };
      byType.set(e.entity_type, cat);
    }
    if (e.event_type === 'created') cat.created++;
    else if (e.event_type === 'updated') cat.updated++;
    else if (e.event_type === 'deleted') cat.deleted++;
    else if (e.event_type === 'reminder') cat.reminders++;
    cat.total++;

    if (e.actor_kind === 'system') systemActorCount++;
    else humanActorCount++;
  }

  const categories = [...byType.values()].sort((a, b) => b.total - a.total || a.entityType.localeCompare(b.entityType));

  return {
    day,
    totalEvents: events.length,
    categories,
    systemActorCount,
    humanActorCount,
  };
}
