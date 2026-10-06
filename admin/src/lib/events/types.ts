// The platform event stream (migration 096).
//
// Three sources write `platform_events`:
//
//   * ROW TRIGGERS on the tables in TRIGGERED_ENTITIES — one line per
//     table in 096, with a column whitelist. entity_type is the TABLE
//     NAME and event_type is created | updated | deleted. The payload is
//     { new, old, changed }: only whitelisted columns, and `updated`
//     fires only when one of them changed.
//   * the REMINDERS cron (lib/reminders) — event_type 'reminder' with
//     payload { bucket, due_date, row } for the entities in
//     REMINDER_ENTITIES, deduped per row per bucket.
//   * emitEvent() (lib/events/emit.ts) for the few things with no row of
//     their own (EMITTED_ENTITIES).
//
// rules.ts subscribes to `${entity}.${event}` keys; rules.test.ts fails
// on a rule listening for an entity nothing emits.

export const TRIGGERED_ENTITIES = [
  'service_requests',
  'absence_records',
  'actions',
  'internal_tasks',
  'documents',
  'employee_documents',
  'policy_acknowledgements',
  'performance_reviews',
  'requisitions',
  'candidates',
  'offers',
  'compliance_items',
  'hs_register_completions',
  'hs_activities',
  'hs_files',
  'hs_documents',
  'hs_audits',
  'hs_incidents',
  'onboarding_instances',
  'onboarding_task_progress',
  'offboarding_instances',
  'offboarding_task_progress',
  'employee_records',
  'companies',
  'enquiries',
  'bd_companies',
  'interview_schedules',
  'referral_scan_runs',
  // Core-OS 360 Phase 2 (123+): the operational H&S core.
  'hazards',
  'risk_assessments',
  'method_statements',
  'coshh_assessments',
  'substances',
  'incident_investigations',
  // Core-OS 360 Phase 3 (137): a Safe to Deploy status change.
  'deployment_status_log',
  // Core-OS 360 Phase 4 (145): a checklist inspection against an asset.
  'inspections',
  // Core-OS 360 Phase 4 (148): a PUWER assessment against an asset.
  'puwer_assessments',
  // Core-OS 360 Phase 4 (149): equipment inspections/examinations,
  // joined so an immediate-danger LOLER finding can be reacted to.
  'hs_equipment_inspections',
  // Core-OS 360 Phase 4 (150): a contractor's approval status change.
  'contractors',
  // Core-OS 360 Phase 4 (152): a permit to work status change.
  'permits',
  // Core-OS 360 Phase 4 (153): an isolation / LOTO status change.
  'isolations',
  // Core-OS 360 Phase 4 (154): an emergency plan added/superseded, and
  // a drill recorded.
  'emergency_plans',
  'emergency_drills',
  // Core-OS 360 Phase 5, Group 1 (156): an environmental aspect added
  // or its status changed (assessed / confirmed significant or not).
  'environmental_aspects',
  // Core-OS 360 Phase 5, Group 2 (157): spills, waste movements,
  // monitoring readings and environmental permits/conditions.
  'environmental_spills',
  'waste_movements',
  'environmental_monitoring',
  'environmental_permits',
  'permit_conditions',
  // Core-OS 360 Phase 5, Group 4 (159): the Legal Register — an
  // applicability decision changing, and a new compliance evaluation.
  'organisation_legal_obligations',
  'compliance_evaluations',
  // Core-OS 360 Phase 5, Group 6 (161): Objectives & Targets, and
  // Management Review — a status change (esp. reaching 'at_risk'/
  // 'missed'/'achieved' on an objective, 'completed' on a review).
  'objectives',
  'management_reviews',
  // Core-OS 360 Phase 5, Group 7 (162): a richer audit finding created/
  // closed, a worker consultation recorded, an environmental complaint
  // received/updated. audit_programmes has no outbox entry of its own
  // (a reminder-only entity, the training_records precedent).
  'audit_findings',
  'consultation_records',
  'environmental_complaints',
  // Core-OS 360 Phase 6, Group 3 (169): the Service Ledger's own three
  // remaining sources — none had a consequence to fire before this,
  // training_records deliberately so (see its own REMINDER_ENTITIES
  // comment); the ledger rule is the first consumer of any of them.
  'consultancy_visits',
  'reports',
  'training_records',
  // Core-OS 360 Phase 7, Group 3 (174): a structured finding captured
  // during a visit. The synchronous immediate-danger escalation
  // (visit_observation_escalate()) already raises its own action at
  // INSERT time — this outbox entry is for an eventual notification
  // alongside that, never instead of it.
  'visit_observations',
  // Core-OS 360 Phase 13, Group 1 (178): a board assurance report's own
  // draft -> issued transition. board_assurance_acknowledgements has
  // deliberately NO outbox entry of its own — one meaningful event per
  // REPORT (its own issue), not one per board member's sign-off.
  'board_assurance_reports',
  // Migration 213: the contract/policy template library's own
  // generated documents (status/category/template_id/employee_id
  // only — never rendered_body/merge_values/signed_by_name). The
  // consequence rule (notify on sent-for-signature/signed/declined)
  // is wired once the signing flow exists to link to.
  'document_instances',
] as const;
export type TriggeredEntity = typeof TRIGGERED_ENTITIES[number];

export const REMINDER_ENTITIES = [
  'compliance_items',
  'employee_documents',
  'documents',
  'hs_documents',
  'policy_acknowledgements',
  'performance_reviews',
  'onboarding_task_progress',
  'offboarding_task_progress',
  'employee_records',
  'absence_records',
  'service_requests',
  'internal_tasks',
  'requisitions',
  'offers',
  'referral_applications',
  'training_records',
  'hs_equipment',
  // Core-OS 360 Phase 2 (122+): the operational H&S core.
  'risk_assessments',
  'method_statements',
  'coshh_assessments',
  'hazards',
  'hs_incidents',
  'incident_investigations',
  'actions',
  // Core-OS 360 Phase 3 (134-135): workforce evidence with an end date.
  'person_credentials',
  'person_authorisations',
  'requirement_exceptions',
  'person_health_outcomes',
  // Core-OS 360 Phase 4 (148): PUWER assessment review cycle.
  'puwer_assessments',
  // Core-OS 360 Phase 4 (150): contractor insurance expiry.
  'contractor_insurances',
  // Core-OS 360 Phase 4 (152): an issued permit's own expiry.
  'permits',
  // Core-OS 360 Phase 4 (154): an emergency plan's own review cycle.
  'emergency_plans',
  // Core-OS 360 Phase 5, Group 2 (157): an environmental permit's
  // expiry and a permit condition's next review date.
  'environmental_permits',
  'permit_conditions',
  // Core-OS 360 Phase 5, Group 3 (158): a real, user-entered ISO
  // certificate's own recorded expiry.
  'iso_certifications',
  // Core-OS 360 Phase 5, Group 4 (159): a legal obligation's own
  // next_review_due, rolled forward from the newest evaluation.
  'organisation_legal_obligations',
  // Core-OS 360 Phase 5, Group 6 (161): an objective's own target_date,
  // and a scheduled management review's own review_date.
  'objectives',
  'management_reviews',
  // Core-OS 360 Phase 5, Group 7 (162): a planned audit's own
  // next_due_date.
  'audit_programmes',
  // Core-OS 360 Phase 7, Group 6: a visit report's own next_
  // visit_recommended_date — closing the loop Group 5 opened. The
  // query itself filters out anything already followed up (see
  // followUpDue.ts), so a row surfacing here genuinely still needs one.
  'consultancy_visit_reports',
  // Core-OS 360 Completion Programme, Phase 26, Group 3 (C14.8): an
  // open site_checkins row (checked_out_at still null) the morning
  // after it was opened. site_checkins has no outbox entry of its own
  // (179's own "attendance, not compliance" posture) — this is a
  // reminder-only entity, the training_records precedent.
  'site_checkins',
  // Fixing the LMS progress-tracking gap: a learning_assignments row
  // (202) with its own due_date and not yet completed.
  'learning_assignments',
] as const;
export type ReminderEntity = typeof REMINDER_ENTITIES[number];

export const EMITTED_ENTITIES = ['manatal_match', 'policy_ack_resend', 'hs_test_submission'] as const;
export type EmittedEntity = typeof EMITTED_ENTITIES[number];

export type RowEventType = 'created' | 'updated' | 'deleted';
export type EventKey =
  | `${TriggeredEntity}.${RowEventType}`
  | `${ReminderEntity}.reminder`
  | `${EmittedEntity}.${RowEventType}`;

export type ActorKind = 'system' | 'staff' | 'provider' | 'client';

export interface RowPayload {
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  changed: string[];
}

export interface ReminderPayload {
  bucket: ReminderBucket;
  due_date: string;
  row: Record<string, unknown>;
  /** The reminder rule that fired (lib/reminders/rules.ts) — an entity
   *  can have more than one dated rule. */
  rule: string;
}

/** How far a dated row is from its due date on the day the reminders
 *  cron ran. One bucket per row per day; the dedupe key makes each
 *  bucket fire once per row, ever. */
export type ReminderBucket = 'due_30' | 'due_7' | 'due_0' | 'overdue' | `overdue_w${number}` | 'sla_breached';

export interface PlatformEvent {
  id:           number;
  occurred_at:  string;
  company_id:   string | null;
  entity_type:  string;
  entity_id:    string | null;
  event_type:   string;
  payload:      Record<string, unknown>;
  actor_id:     string | null;
  actor_kind:   ActorKind;
  dedupe_key:   string | null;
  claimed_at:   string | null;
  processed_at: string | null;
  attempts:     number;
  last_error:   string | null;
}

export function eventKey(e: Pick<PlatformEvent, 'entity_type' | 'event_type'>): string {
  return `${e.entity_type}.${e.event_type}`;
}

export function rowPayload(e: PlatformEvent): RowPayload {
  const p = e.payload as Partial<RowPayload>;
  return {
    new: (p.new ?? {}) as Record<string, unknown>,
    old: (p.old ?? {}) as Record<string, unknown>,
    changed: Array.isArray(p.changed) ? (p.changed as string[]) : [],
  };
}

export function reminderPayload(e: PlatformEvent): ReminderPayload {
  const p = e.payload as Partial<ReminderPayload>;
  return {
    bucket: (p.bucket ?? 'overdue') as ReminderBucket,
    due_date: String(p.due_date ?? ''),
    row: (p.row ?? {}) as Record<string, unknown>,
    rule: String(p.rule ?? e.entity_type),
  };
}

/** True when an UPDATE event changed `col` to one of `to` (any value if omitted). */
export function changedTo(e: PlatformEvent, col: string, to?: readonly string[]): boolean {
  const p = rowPayload(e);
  if (!p.changed.includes(col)) return false;
  if (!to) return true;
  return to.includes(String(p.new[col]));
}

export const isOverdueWeekly = (b: string): boolean => /^overdue_w\d+$/.test(b);
