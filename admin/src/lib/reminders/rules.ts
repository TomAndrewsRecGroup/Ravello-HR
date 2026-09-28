import type { SupabaseClient } from '@supabase/supabase-js';
import { daysUntil } from '@/lib/hs/recurrence';
import type { ReminderBucket, ReminderEntity } from '@/lib/events/types';

// What has a due date, and what "due" means for it.
//
// Nothing on the platform ever set `overdue` or emailed anyone about a
// date: the dashboards read a stored status nothing wrote, so their
// overdue columns were always empty. The reminders cron (run.ts) walks
// each rule below once a morning, puts every dated open row into a
// bucket, emits one `<entity>.reminder` event per row per bucket (the
// dedupe key makes each fire once, ever) and then performs the STATUS
// WRITES so a stored status is finally true.
//
// The `select` list is also the payload whitelist: a reminder event
// carries these columns and nothing else, so keep them non-sensitive.

export type BucketWant = 'due_30' | 'due_7' | 'due_0' | 'overdue' | 'overdue_weekly';

export interface ReminderRule {
  id:       string;
  entity:   ReminderEntity;
  /** Columns to read; must include id and whatever dueDateOf/companyOf need. */
  select:   string;
  /** Narrow to open rows. Must keep a stable order for paging. */
  query:    (sb: SupabaseClient, from: number, to: number, today: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
  dueDateOf: (row: Record<string, unknown>, today: string) => string | null;
  companyOf?: (row: Record<string, unknown>) => string | null;
  buckets:  BucketWant[];
}

/** Day 0 = due today. Negative = overdue: 'overdue' for the first
 *  week, then 'overdue_w<n>' each week after, so a rule that wants
 *  weekly nags gets exactly one per week. */
export function bucketFor(due: string, today: string): ReminderBucket | null {
  const d = daysUntil(due, today);
  if (d > 30) return null;
  if (d > 7)  return 'due_30';
  if (d > 0)  return 'due_7';
  if (d === 0) return 'due_0';
  if (d > -7) return 'overdue';
  return `overdue_w${Math.floor(-d / 7)}`;
}

export function wanted(bucket: ReminderBucket, wants: BucketWant[]): boolean {
  if (/^overdue_w\d+$/.test(bucket)) return wants.includes('overdue_weekly');
  return wants.includes(bucket as BucketWant);
}

export function addDays(iso: string, days: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const str = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 10));

export const REMINDERS: ReminderRule[] = [
  {
    id: 'compliance_items', entity: 'compliance_items',
    select: 'id, company_id, title, domain, category, due_date, status',
    query: (sb, from, to) => sb.from('compliance_items').select('id, company_id, title, domain, category, due_date, status')
      .in('status', ['pending', 'in_review', 'overdue']).not('due_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.due_date),
    buckets: ['due_30', 'due_7', 'overdue', 'overdue_weekly'],
  },
  {
    // training_records links employee_id rather than storing a
    // free-text employee_name (unlike employee_documents) — the
    // consuming rule (lib/events/rules.ts) looks the name up itself,
    // the same way hsRules.ts's itemTitle() does, rather than an embed
    // here: slimRow() never lets an embed into the reminder payload.
    id: 'training_records', entity: 'training_records',
    // person_id since 134: a record added through the workforce pages may
    // have no employee_records row behind it.
    select: 'id, company_id, employee_id, person_id, course_id, course_name, expires_on',
    query: (sb, from, to) => sb.from('training_records').select('id, company_id, employee_id, person_id, course_id, course_name, expires_on')
      .not('expires_on', 'is', null).neq('verification_status', 'rejected').order('id').range(from, to),
    dueDateOf: r => str(r.expires_on),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  // ── Core-OS 360 Phase 3: workforce evidence (134-135) ──
  // Ids and dates only: the consuming rules (workforceRules.ts) look up
  // names themselves and skip a row a newer one has replaced.
  {
    id: 'person_credentials', entity: 'person_credentials',
    select: 'id, company_id, person_id, credential_type_id, expires_on',
    query: (sb, from, to) => sb.from('person_credentials').select('id, company_id, person_id, credential_type_id, expires_on')
      .not('expires_on', 'is', null).neq('verification_status', 'rejected').order('id').range(from, to),
    dueDateOf: r => str(r.expires_on),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    id: 'person_authorisations', entity: 'person_authorisations',
    select: 'id, company_id, person_id, authorisation_type_id, expires_on',
    query: (sb, from, to) => sb.from('person_authorisations').select('id, company_id, person_id, authorisation_type_id, expires_on')
      .eq('status', 'active').not('expires_on', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.expires_on),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    // A temporary exception lapsing puts the person back to NOT_READY.
    id: 'requirement_exceptions', entity: 'requirement_exceptions',
    select: 'id, company_id, person_id, requirement_type, kind, valid_until',
    query: (sb, from, to) => sb.from('requirement_exceptions').select('id, company_id, person_id, requirement_type, kind, valid_until')
      .is('revoked_at', null).order('id').range(from, to),
    dueDateOf: r => str(r.valid_until),
    buckets: ['due_7', 'due_0'],
  },
  {
    // The outcome CATEGORY is not selected: a reminder says a review is
    // due, never what the last one found.
    id: 'person_health_outcomes', entity: 'person_health_outcomes',
    select: 'id, company_id, person_id, requirement_id, review_date',
    query: (sb, from, to) => sb.from('person_health_outcomes').select('id, company_id, person_id, requirement_id, review_date')
      .not('review_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.review_date),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    id: 'employee_documents', entity: 'employee_documents',
    select: 'id, company_id, title, doc_type, employee_name, expiry_date, status',
    query: (sb, from, to) => sb.from('employee_documents').select('id, company_id, title, doc_type, employee_name, expiry_date, status')
      .in('status', ['active', 'pending_renewal', 'expired']).not('expiry_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.expiry_date),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    id: 'documents', entity: 'documents',
    select: 'id, company_id, name, category, review_due_at, status',
    query: (sb, from, to) => sb.from('documents').select('id, company_id, name, category, review_due_at, status')
      .eq('status', 'active').not('review_due_at', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.review_due_at),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    id: 'hs_documents', entity: 'hs_documents',
    select: 'id, company_id, title, category, review_due_at, status',
    query: (sb, from, to) => sb.from('hs_documents').select('id, company_id, title, category, review_due_at, status')
      .eq('status', 'active').not('review_due_at', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.review_due_at),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    id: 'policy_acknowledgements', entity: 'policy_acknowledgements',
    select: 'id, company_id, document_id, employee_id, sent_at, status',
    query: (sb, from, to) => sb.from('policy_acknowledgements').select('id, company_id, document_id, employee_id, sent_at, status')
      .in('status', ['pending', 'overdue']).not('sent_at', 'is', null).order('id').range(from, to),
    dueDateOf: r => (r.sent_at ? addDays(String(r.sent_at), 14) : null),
    buckets: ['overdue', 'overdue_weekly'],
  },
  {
    id: 'performance_reviews', entity: 'performance_reviews',
    select: 'id, company_id, employee_name, review_type, due_date, status',
    query: (sb, from, to) => sb.from('performance_reviews').select('id, company_id, employee_name, review_type, due_date, status')
      .in('status', ['pending', 'scheduled', 'in_progress', 'overdue']).not('due_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.due_date),
    buckets: ['due_7', 'overdue', 'overdue_weekly'],
  },
  {
    id: 'onboarding_task_progress', entity: 'onboarding_task_progress',
    select: 'id, instance_id, task_title, due_date, status, instance:onboarding_instances(company_id)',
    query: (sb, from, to) => sb.from('onboarding_task_progress').select('id, instance_id, task_title, due_date, status, instance:onboarding_instances(company_id)')
      .in('status', ['pending', 'in_progress']).not('due_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.due_date),
    companyOf: r => companyViaInstance(r),
    buckets: ['due_0', 'overdue'],
  },
  {
    id: 'offboarding_task_progress', entity: 'offboarding_task_progress',
    select: 'id, instance_id, task_title, due_date, status, instance:offboarding_instances(company_id)',
    query: (sb, from, to) => sb.from('offboarding_task_progress').select('id, instance_id, task_title, due_date, status, instance:offboarding_instances(company_id)')
      .in('status', ['pending', 'in_progress']).not('due_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.due_date),
    companyOf: r => companyViaInstance(r),
    buckets: ['due_0', 'overdue'],
  },
  {
    id: 'employee_records', entity: 'employee_records',
    select: 'id, company_id, full_name, probation_end, status',
    query: (sb, from, to) => sb.from('employee_records').select('id, company_id, full_name, probation_end, status')
      .eq('status', 'active').not('probation_end', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.probation_end),
    buckets: ['due_30', 'due_7'],
  },
  {
    id: 'absence_records', entity: 'absence_records',
    select: 'id, company_id, employee_name, absence_type, start_date, status, created_at',
    query: (sb, from, to) => sb.from('absence_records').select('id, company_id, employee_name, absence_type, start_date, status, created_at')
      .eq('status', 'pending').order('id').range(from, to),
    dueDateOf: r => (r.created_at ? addDays(String(r.created_at), 3) : null),
    buckets: ['overdue', 'overdue_weekly'],
  },
  {
    id: 'service_requests', entity: 'service_requests',
    select: 'id, company_id, subject, request_type, urgency, status, created_at',
    query: (sb, from, to) => sb.from('service_requests').select('id, company_id, subject, request_type, urgency, status, created_at')
      .in('status', ['new', 'in_progress']).is('responded_at', null).order('id').range(from, to),
    dueDateOf: r => (r.created_at ? addDays(String(r.created_at), 1) : null),
    buckets: ['overdue', 'overdue_weekly'],
  },
  {
    // Equipment (112) is register-shaped, not embedded — the row
    // already carries its own name, no lookup needed.
    id: 'hs_equipment', entity: 'hs_equipment',
    select: 'id, company_id, name, category, next_inspection_due, status',
    query: (sb, from, to) => sb.from('hs_equipment').select('id, company_id, name, category, next_inspection_due, status')
      .eq('status', 'in_service').not('next_inspection_due', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.next_inspection_due),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    // Core-OS 360 Phase 4 (148/148a): PUWER's own review cycle.
    // puwer_assessments is INSERT-ONLY (a correction is a new
    // assessment), so reading it directly would fire once per
    // HISTORICAL row — every past assessment's review_due_on, not just
    // the current one. 148a rolls the latest assessment's review date
    // forward onto hs_equipment.puwer_review_due_on (the same pattern
    // hs_equipment_inspections already uses for next_inspection_due),
    // so this rule reads the ONE column that reflects the live state.
    id: 'puwer_assessments', entity: 'puwer_assessments',
    select: 'id, company_id, name, puwer_review_due_on',
    query: (sb, from, to) => sb.from('hs_equipment').select('id, company_id, name, puwer_review_due_on')
      .eq('puwer_applicable', true).not('puwer_review_due_on', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.puwer_review_due_on),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    // Core-OS 360 Phase 4 (150): contractor insurance expiry. One row
    // per (contractor, insurance_type) — a renewal updates it in place,
    // so unlike the insert-only tables elsewhere in this file, reading
    // it directly is already correct: there is only ever one row per
    // type to be due. The consuming rule looks the contractor's name up
    // itself, the same way every other reminder in this file does.
    id: 'contractor_insurances', entity: 'contractor_insurances',
    select: 'id, company_id, contractor_id, insurance_type, expires_on',
    query: (sb, from, to) => sb.from('contractor_insurances').select('id, company_id, contractor_id, insurance_type, expires_on')
      .order('id').range(from, to),
    dueDateOf: r => str(r.expires_on),
    buckets: ['due_30', 'due_7', 'overdue'],
  },
  {
    id: 'internal_tasks', entity: 'internal_tasks',
    select: 'id, company_id, title, due_date, status, assigned_to',
    query: (sb, from, to) => sb.from('internal_tasks').select('id, company_id, title, due_date, status, assigned_to')
      .in('status', ['todo', 'in_progress']).not('due_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.due_date),
    buckets: ['due_0', 'overdue'],
  },
];

// ── HIRE ──────────────────────────────────────────────────────
// A role with no stage change for two weeks (stage_changed_at, 104);
// an offer against its deadline; a referral left in the review queue.
const OPEN_STAGES = ['submitted', 'in_progress', 'shortlist_ready', 'interview', 'offer'];
export const STALE_ROLE_AFTER_DAYS = 14;
export const REFERRAL_REVIEW_AFTER_DAYS = 2;
REMINDERS.push(
  {
    id: 'requisitions', entity: 'requisitions',
    select: 'id, company_id, title, stage_changed_at, assigned_recruiter',
    query: (sb, from, to) => sb.from('requisitions').select('id, company_id, title, stage_changed_at, assigned_recruiter')
      .in('stage', OPEN_STAGES).not('stage_changed_at', 'is', null).order('id').range(from, to),
    dueDateOf: r => (r.stage_changed_at ? addDays(String(r.stage_changed_at), STALE_ROLE_AFTER_DAYS) : null),
    buckets: ['overdue', 'overdue_weekly'],
  },
  {
    id: 'offers', entity: 'offers',
    select: 'id, company_id, requisition_id, candidate_id, status, deadline',
    query: (sb, from, to) => sb.from('offers').select('id, company_id, requisition_id, candidate_id, status, deadline')
      .in('status', ['sent', 'verbal_accepted']).not('deadline', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.deadline),
    buckets: ['due_7', 'due_0', 'overdue', 'overdue_weekly'],
  },
  {
    id: 'referral_applications', entity: 'referral_applications',
    select: 'id, company_id, requisition_id, candidate_id, status, created_at',
    query: (sb, from, to) => sb.from('referral_applications').select('id, company_id, requisition_id, candidate_id, status, created_at')
      .eq('status', 'review_pending').order('id').range(from, to),
    dueDateOf: r => (r.created_at ? addDays(String(r.created_at), REFERRAL_REVIEW_AFTER_DAYS) : null),
    buckets: ['overdue', 'overdue_weekly'],
  },
);

// ── PROTECT: the operational safety core (Phase 2, 123-125) ──────
// Controlled documents fall due for review; a RAMS reaches its end
// date; a hazard sits unassessed; a RIDDOR review stays undecided; an
// investigation or a safety action passes its date. Titles and
// references only — never a description, which can hold medical detail.
export const HAZARD_UNASSESSED_AFTER_DAYS = 14;
export const RIDDOR_UNRESOLVED_AFTER_DAYS = 3;
export const SAFETY_ACTION_SOURCES = ['incident', 'investigation', 'hazard', 'risk_assessment', 'method_statement',
  'coshh_assessment', 'riddor_review', 'audit', 'audit_finding', 'inspection', 'equipment_inspection', 'hs_check'] as const;
const LIVE_DOC = ['approved', 'active'];
REMINDERS.push(
  {
    id: 'risk_assessments', entity: 'risk_assessments',
    select: 'id, company_id, reference, version, title, review_date, status, assessor_id, responsible_manager_id',
    query: (sb, from, to) => sb.from('risk_assessments').select('id, company_id, reference, version, title, review_date, status, assessor_id, responsible_manager_id')
      .in('status', LIVE_DOC).not('review_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.review_date),
    buckets: ['due_30', 'due_7', 'overdue', 'overdue_weekly'],
  },
  {
    id: 'method_statements', entity: 'method_statements',
    select: 'id, company_id, reference, version, title, review_date, status, author_id, responsible_manager_id',
    query: (sb, from, to) => sb.from('method_statements').select('id, company_id, reference, version, title, review_date, status, author_id, responsible_manager_id')
      .in('status', LIVE_DOC).not('review_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.review_date),
    buckets: ['due_30', 'due_7', 'overdue', 'overdue_weekly'],
  },
  {
    id: 'method_statements_end', entity: 'method_statements',
    select: 'id, company_id, reference, version, title, end_date, status, author_id, responsible_manager_id',
    query: (sb, from, to) => sb.from('method_statements').select('id, company_id, reference, version, title, end_date, status, author_id, responsible_manager_id')
      .in('status', LIVE_DOC).not('end_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.end_date),
    buckets: ['due_7', 'due_0', 'overdue'],
  },
  {
    id: 'coshh_assessments', entity: 'coshh_assessments',
    select: 'id, company_id, reference, version, title, review_date, status, assessor_id, responsible_manager_id',
    query: (sb, from, to) => sb.from('coshh_assessments').select('id, company_id, reference, version, title, review_date, status, assessor_id, responsible_manager_id')
      .in('status', LIVE_DOC).not('review_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.review_date),
    buckets: ['due_30', 'due_7', 'overdue', 'overdue_weekly'],
  },
  {
    id: 'hazards', entity: 'hazards',
    select: 'id, company_id, reference, title, status, owner_id, identified_at',
    query: (sb, from, to) => sb.from('hazards').select('id, company_id, reference, title, status, owner_id, identified_at')
      .eq('status', 'identified').order('id').range(from, to),
    dueDateOf: r => (r.identified_at ? addDays(String(r.identified_at), HAZARD_UNASSESSED_AFTER_DAYS) : null),
    buckets: ['overdue', 'overdue_weekly'],
  },
  {
    id: 'hs_incidents', entity: 'hs_incidents',
    select: 'id, company_id, incident_number, incident_type, riddor_review_status, status, reported_at',
    query: (sb, from, to) => sb.from('hs_incidents').select('id, company_id, incident_number, incident_type, riddor_review_status, status, reported_at')
      .in('riddor_review_status', ['review_required', 'potentially_reportable', 'confirmed_reportable'])
      .not('status', 'in', '(closed,archived)').order('id').range(from, to),
    dueDateOf: r => (r.reported_at ? addDays(String(r.reported_at), RIDDOR_UNRESOLVED_AFTER_DAYS) : null),
    buckets: ['overdue', 'overdue_weekly'],
  },
  {
    id: 'incident_investigations', entity: 'incident_investigations',
    select: 'id, company_id, incident_id, reference, status, lead_investigator_id, target_completion_date',
    query: (sb, from, to) => sb.from('incident_investigations').select('id, company_id, incident_id, reference, status, lead_investigator_id, target_completion_date')
      .in('status', ['in_progress', 'changes_requested']).not('target_completion_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.target_completion_date),
    buckets: ['due_7', 'overdue', 'overdue_weekly'],
  },
  {
    id: 'actions', entity: 'actions',
    select: 'id, company_id, title, due_date, status, source_type, assigned_to, verifier_id',
    query: (sb, from, to) => sb.from('actions').select('id, company_id, title, due_date, status, source_type, assigned_to, verifier_id')
      .in('status', ['active', 'in_progress', 'awaiting_verification']).in('source_type', [...SAFETY_ACTION_SOURCES])
      .not('due_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.due_date),
    buckets: ['due_7', 'due_0', 'overdue', 'overdue_weekly'],
  },
);

function companyViaInstance(r: Record<string, unknown>): string | null {
  const inst = r.instance as { company_id?: string } | { company_id?: string }[] | null | undefined;
  const one = Array.isArray(inst) ? inst[0] : inst;
  return one?.company_id ?? null;
}

/** The status writes the cron performs after emitting, so the stored
 *  status agrees with the calendar. Each is a counted UPDATE. */
export interface StatusWrite {
  id:    string;
  table: string;
  apply: (sb: SupabaseClient, today: string) => PromiseLike<{ error: { message: string } | null; count: number | null }>;
}

export const STATUS_WRITES: StatusWrite[] = [
  {
    // Offboarding sets end_date and keeps the record active until the
    // last working day; this is what turns it terminated on the day
    // (and fires employee_records.updated → the employee_left rule).
    id: 'employee_terminated', table: 'employee_records',
    apply: (sb, today) => sb.from('employee_records').update({ status: 'terminated' }, { count: 'exact' })
      .lte('end_date', today).neq('status', 'terminated'),
  },
  {
    id: 'compliance_overdue', table: 'compliance_items',
    apply: (sb, today) => sb.from('compliance_items').update({ status: 'overdue' }, { count: 'exact' })
      .lt('due_date', today).in('status', ['pending', 'in_review']),
  },
  {
    id: 'employee_document_expired', table: 'employee_documents',
    apply: (sb, today) => sb.from('employee_documents').update({ status: 'expired' }, { count: 'exact' })
      .lt('expiry_date', today).in('status', ['active', 'pending_renewal']),
  },
  {
    id: 'policy_ack_overdue', table: 'policy_acknowledgements',
    apply: (sb, today) => sb.from('policy_acknowledgements').update({ status: 'overdue', reminder_sent: true }, { count: 'exact' })
      .eq('status', 'pending').lt('sent_at', `${addDays(today, -14)}T00:00:00Z`),
  },
];
