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
    select: 'id, company_id, title, domain, category, due_date, status, provider_id',
    query: (sb, from, to) => sb.from('compliance_items').select('id, company_id, title, domain, category, due_date, status, provider_id')
      .in('status', ['pending', 'in_review', 'overdue']).not('due_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.due_date),
    buckets: ['due_30', 'due_7', 'overdue', 'overdue_weekly'],
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
    id: 'internal_tasks', entity: 'internal_tasks',
    select: 'id, company_id, title, due_date, status, assigned_to',
    query: (sb, from, to) => sb.from('internal_tasks').select('id, company_id, title, due_date, status, assigned_to')
      .in('status', ['todo', 'in_progress']).not('due_date', 'is', null).order('id').range(from, to),
    dueDateOf: r => str(r.due_date),
    buckets: ['due_0', 'overdue'],
  },
];

REMINDERS.push({
  id: 'hs_provider_companies', entity: 'hs_provider_companies',
  select: 'id, company_id, provider_id, status, ends_on, scopes',
  query: (sb, from, to) => sb.from('hs_provider_companies').select('id, company_id, provider_id, status, ends_on, scopes')
    .eq('status', 'active').not('ends_on', 'is', null).order('id').range(from, to),
  dueDateOf: r => str(r.ends_on),
  buckets: ['due_30', 'due_7'],
});

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
