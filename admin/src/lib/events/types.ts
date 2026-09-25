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
  'hs_provider_companies',
  'onboarding_instances',
  'onboarding_task_progress',
  'offboarding_instances',
  'offboarding_task_progress',
  'employee_records',
  'companies',
  'enquiries',
  'bd_companies',
] as const;
export type TriggeredEntity = typeof TRIGGERED_ENTITIES[number];

export const REMINDER_ENTITIES = [
  'compliance_items',
  'employee_documents',
  'documents',
  'policy_acknowledgements',
  'performance_reviews',
  'onboarding_task_progress',
  'offboarding_task_progress',
  'employee_records',
  'absence_records',
  'service_requests',
  'internal_tasks',
] as const;
export type ReminderEntity = typeof REMINDER_ENTITIES[number];

export const EMITTED_ENTITIES = ['manatal_match'] as const;
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
}

/** How far a dated row is from its due date on the day the reminders
 *  cron ran. One bucket per row per day; the dedupe key makes each
 *  bucket fire once per row, ever. */
export type ReminderBucket = 'due_30' | 'due_7' | 'due_0' | 'overdue' | `overdue_w${number}`;

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
