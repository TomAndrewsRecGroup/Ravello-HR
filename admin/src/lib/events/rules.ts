import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceRequestReceivedEmail } from '@/lib/email';
import { portalUrl } from '@/lib/portalUrl';
import { CANDIDATE_CLIENT_STATUS_LABELS, type CandidateClientStatus } from '@/lib/ui/statusMaps';
import type { Audience, NotifyInput } from '@/lib/notify/notify';
import {
  changedTo, isOverdueWeekly, reminderPayload, rowPayload,
  type EventKey, type PlatformEvent, type ReminderBucket,
} from './types';

// THE rules registry: what happens after each thing that happens.
//
// A rule listens for one `${entity}.${event}` key, optionally filters
// with `when`, and returns consequences. The consumer (process.ts)
// runs them with the service role and makes each consequence
// idempotent by key, so a rule is written as if it might run twice.
//
// Rules build notifications from ROW DATA the platform wrote (titles,
// names, statuses). Nothing here generates text.
//
// Adding a rule: pick an `on` key that something emits (rules.test.ts
// fails otherwise), a notification type from lib/notify/types.ts, and
// keep the audience honest — `staff` is tps_admin only.

export type NotifyConsequence = { kind: 'notify'; input: Omit<NotifyInput, 'dedupeKey' | 'eventId'> };
export type EmailConsequence = {
  kind: 'email';
  to: string;
  message: { subject: string; html: string; tag?: string };
  target: { type: 'user' | 'employee' | 'company' | 'candidate'; id: string; profileId?: string | null };
};
export type RunConsequence = { kind: 'run'; label: string; fn: (sb: SupabaseClient) => Promise<void> };
export type Consequence = NotifyConsequence | EmailConsequence | RunConsequence;

export interface RuleContext {
  sb: SupabaseClient;
  event: PlatformEvent;
  /** Memoised; '' when the event has no company. */
  companyName: () => Promise<string>;
  /** Memoised profile lookup by id: email + name, or null. */
  profile: (id: string) => Promise<{ email: string | null; full_name: string | null } | null>;
}

export interface Rule {
  id:    string;
  on:    EventKey;
  when?: (e: PlatformEvent) => boolean;
  then:  (ctx: RuleContext) => Promise<Consequence[]> | Consequence[];
}

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));

const notifyC = (input: NotifyConsequence['input']): NotifyConsequence => ({ kind: 'notify', input });

const staffOnly: Audience[] = [{ kind: 'staff' }];
const admins    = (companyId: string): Audience[] => [{ kind: 'company_admins', companyId }];
const editors   = (companyId: string): Audience[] => [{ kind: 'company_editors', companyId }];

const DECIDED: readonly CandidateClientStatus[] = ['approved', 'rejected', 'info_requested'];

// ── row-triggered rules ──────────────────────────────────────────

const rowRules: Rule[] = [
  {
    // X1 site 1: the portal's new-role form tried to insert staff
    // notifications under the client's session, which the INSERT
    // policy refuses. The trigger sees the requisition instead.
    id: 'role_raised',
    on: 'requisitions.created',
    when: e => e.actor_kind === 'client',
    then: async ({ event, companyName }) => {
      const { new: n } = rowPayload(event);
      const title = s(n.title, 'Untitled role');
      return [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'role_pending_approval', urgent: true,
        title: `New role awaiting approval: ${title}`,
        body:  `${await companyName() || 'A client'} has submitted "${title}" for approval.`,
        link:  { admin: `/hiring/${event.entity_id}` },
      })];
    },
  },
  {
    // X1 site 2: emitted by the portal move-stage route (no local row).
    id: 'manatal_stage_moved',
    on: 'manatal_match.updated',
    then: ({ event }) => {
      const p = event.payload;
      const candidate = s(p.candidate_name, 'A candidate');
      return [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'candidate_stage_move',
        title: `${candidate} moved to ${s(p.stage_name, 'a new stage')}`,
        body:  `${s(p.user_name, 'A user')} at ${s(p.company_name, 'a client')} moved ${candidate} to "${s(p.stage_name)}" for ${s(p.job_name, 'a role')}.`,
        link:  { admin: '/hiring' },
      })];
    },
  },
  {
    // A client's decision on a candidate is the thing the hiring page
    // exists for; the recruiter was never told.
    id: 'candidate_decided',
    on: 'candidates.updated',
    when: e => e.actor_kind === 'client' && changedTo(e, 'client_status', DECIDED),
    then: async ({ event, companyName }) => {
      const { new: n } = rowPayload(event);
      const status = s(n.client_status) as CandidateClientStatus;
      const label = CANDIDATE_CLIENT_STATUS_LABELS[status] ?? status;
      return [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'candidate_feedback', urgent: true,
        title: `${s(n.full_name, 'A candidate')}: ${label}`,
        body:  `${await companyName() || 'The client'} responded to a candidate.`,
        link:  { admin: `/hiring/${s(n.requisition_id)}` },
      })];
    },
  },
  {
    // Raise → the account owner hears at once, the raiser gets a receipt.
    id: 'service_request_raised',
    on: 'service_requests.created',
    then: async ({ event, companyName, profile }) => {
      const { new: n } = rowPayload(event);
      const subject = s(n.subject, 'Service request');
      const out: Consequence[] = [notifyC({
        audiences: [{ kind: 'account_owner', companyId: event.company_id ?? '' }],
        companyId: event.company_id, type: 'service_request_created', urgent: true,
        title: `Service request from ${await companyName() || 'a client'}: ${subject}`,
        body:  `${s(n.request_type).replace(/_/g, ' ')}${n.urgency ? ` · ${s(n.urgency)} urgency` : ''}`,
        link:  { admin: '/requests' },
      })];
      const raiser = n.submitted_by ? await profile(s(n.submitted_by)) : null;
      if (raiser?.email) {
        out.push({
          kind: 'email',
          to: raiser.email,
          target: { type: 'user', id: s(n.submitted_by), profileId: s(n.submitted_by) },
          message: serviceRequestReceivedEmail({
            to: raiser.email, subject,
            requestType: s(n.request_type).replace(/_/g, ' '),
            urgency: n.urgency ? s(n.urgency) : null,
            supportUrl: `${portalUrl()}/support`,
          }),
        });
      }
      return out;
    },
  },
  {
    id: 'action_completed_by_client',
    on: 'actions.updated',
    when: e => e.actor_kind === 'client' && changedTo(e, 'status', ['complete']),
    then: async ({ event, companyName }) => {
      const { new: n } = rowPayload(event);
      return [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'action_completed',
        title: `${await companyName() || 'A client'} completed: ${s(n.title, 'an action')}`,
        link:  { admin: `/clients/${event.company_id}` },
      })];
    },
  },
  {
    id: 'internal_task_assigned',
    on: 'internal_tasks.created',
    when: e => !!rowPayload(e).new.assigned_to && rowPayload(e).new.assigned_to !== e.actor_id,
    then: ({ event }) => [taskAssigned(event)],
  },
  {
    id: 'internal_task_reassigned',
    on: 'internal_tasks.updated',
    when: e => changedTo(e, 'assigned_to') && !!rowPayload(e).new.assigned_to && rowPayload(e).new.assigned_to !== e.actor_id,
    then: ({ event }) => [taskAssigned(event)],
  },
  {
    id: 'payment_failed',
    on: 'companies.updated',
    when: e => changedTo(e, 'subscription_status', ['past_due', 'unpaid']),
    then: async ({ event, companyName }) => [notifyC({
      audiences: staffOnly, companyId: event.company_id, type: 'payment_failed', urgent: true,
      title: `Payment failed: ${await companyName() || 'a client'}`,
      body:  `Subscription is now ${s(rowPayload(event).new.subscription_status).replace(/_/g, ' ')}.`,
      link:  { admin: `/clients/${event.company_id}` },
    })],
  },
];

function taskAssigned(event: PlatformEvent): NotifyConsequence {
  const { new: n } = rowPayload(event);
  return notifyC({
    audiences: [{ kind: 'user', userId: s(n.assigned_to) }], companyId: event.company_id, type: 'task_assigned',
    title: `Task assigned to you: ${s(n.title, 'Untitled')}`,
    body:  n.due_date ? `Due ${s(n.due_date)}` : null,
    link:  { admin: '/tasks' },
  });
}

// ── reminder rules ───────────────────────────────────────────────
// One per dated entity: which buckets matter, who hears, where the
// link goes. The reminders cron decides the bucket (lib/reminders).

const dueSoon = (b: ReminderBucket) => b === 'due_30' || b === 'due_7';
const dueNow  = (b: ReminderBucket) => b === 'due_0';
const overdue = (b: ReminderBucket) => b === 'overdue' || isOverdueWeekly(b);

function whenText(b: ReminderBucket, due: string): string {
  if (b === 'due_30') return `due ${due}`;
  if (b === 'due_7')  return `due within a week (${due})`;
  if (b === 'due_0')  return 'due today';
  if (b === 'overdue') return `overdue since ${due}`;
  const m = /^overdue_w(\d+)$/.exec(b);
  return m ? `${m[1]} week${m[1] === '1' ? '' : 's'} overdue (due ${due})` : `due ${due}`;
}

const reminderRules: Rule[] = [
  {
    id: 'compliance_reminder',
    on: 'compliance_items.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || overdue(b); },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      const isOver = overdue(bucket);
      const audiences: Audience[] = event.company_id ? [...admins(event.company_id), ...staffOnly] : staffOnly;
      if (row.provider_id) audiences.push({ kind: 'provider_users', providerId: s(row.provider_id) });
      return [notifyC({
        audiences, companyId: event.company_id, type: isOver ? 'compliance_overdue' : 'compliance_due_soon',
        urgent: isOver,
        title: `${s(row.title, 'Compliance item')} is ${whenText(bucket, due_date)}`,
        link:  { admin: `/clients/${event.company_id}`, portal: '/protect/compliance' },
      })];
    },
  },
  {
    id: 'employee_document_reminder',
    on: 'employee_documents.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      const expired = bucket === 'overdue';
      return [notifyC({
        audiences: admins(event.company_id ?? ''), companyId: event.company_id,
        type: expired ? 'employee_document_expired' : 'employee_document_expiring',
        title: `${s(row.title, s(row.doc_type, 'Document'))} for ${s(row.employee_name, 'an employee')} ${expired ? `expired on ${due_date}` : `expires ${due_date}`}`,
        link:  { portal: '/lead/employee-docs' },
      })];
    },
  },
  {
    id: 'document_review_reminder',
    on: 'documents.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: 'document_review_due',
        title: `Review of "${s(row.name, 'a document')}" is ${whenText(bucket, due_date)}`,
        link:  { admin: `/clients/${event.company_id}`, portal: '/lead/documents' },
      })];
    },
  },
  {
    id: 'policy_ack_reminder',
    on: 'policy_acknowledgements.reminder',
    when: e => overdue(reminderPayload(e).bucket),
    then: ({ event }) => [notifyC({
      audiences: admins(event.company_id ?? ''), companyId: event.company_id, type: 'policy_ack_overdue',
      title: 'A policy acknowledgement is overdue',
      body:  `Sent ${s(reminderPayload(event).row.sent_at).slice(0, 10)}, still unacknowledged after 14 days.`,
      link:  { portal: '/lead/policy-acknowledgements' },
    })],
  },
  {
    id: 'review_reminder',
    on: 'performance_reviews.reminder',
    when: e => { const b = reminderPayload(e).bucket; return b === 'due_7' || overdue(b); },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: admins(event.company_id ?? ''), companyId: event.company_id, type: 'review_due',
        title: `${s(row.review_type, 'Review').replace(/_/g, ' ')} review for ${s(row.employee_name, 'an employee')} is ${whenText(bucket, due_date)}`,
        link:  { portal: '/lead/reviews' },
      })];
    },
  },
  {
    id: 'onboarding_task_reminder',
    on: 'onboarding_task_progress.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueNow(b) || overdue(b); },
    then: ({ event }) => checklistTask(event, '/lead/onboarding', 'Onboarding'),
  },
  {
    id: 'offboarding_task_reminder',
    on: 'offboarding_task_progress.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueNow(b) || overdue(b); },
    then: ({ event }) => checklistTask(event, '/lead/offboarding', 'Offboarding'),
  },
  {
    id: 'probation_reminder',
    on: 'employee_records.reminder',
    when: e => dueSoon(reminderPayload(e).bucket),
    then: ({ event }) => {
      const { due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: admins(event.company_id ?? ''), companyId: event.company_id, type: 'probation_ending',
        title: `${s(row.full_name, 'An employee')}'s probation ends ${due_date}`,
        link:  { portal: '/lead/employee-records' },
      })];
    },
  },
  {
    id: 'absence_pending_reminder',
    on: 'absence_records.reminder',
    when: e => overdue(reminderPayload(e).bucket),
    then: ({ event }) => {
      const { row } = reminderPayload(event);
      return [notifyC({
        audiences: editors(event.company_id ?? ''), companyId: event.company_id, type: 'absence_pending',
        title: `Leave request from ${s(row.employee_name, 'an employee')} is still waiting for a decision`,
        body:  `${s(row.absence_type).replace(/_/g, ' ')} from ${s(row.start_date)}`,
        link:  { portal: '/lead/absence' },
      })];
    },
  },
  {
    id: 'service_request_overdue_reminder',
    on: 'service_requests.reminder',
    when: e => overdue(reminderPayload(e).bucket),
    then: async ({ event, companyName }) => {
      const { bucket, row } = reminderPayload(event);
      return [notifyC({
        audiences: [{ kind: 'account_owner', companyId: event.company_id ?? '' }], companyId: event.company_id,
        type: 'service_request_overdue', urgent: true,
        title: `Unanswered service request from ${await companyName() || 'a client'}: ${s(row.subject)}`,
        body:  isOverdueWeekly(bucket) ? 'Still no response after more than a week.' : 'No response after 24 hours.',
        link:  { admin: '/requests' },
      })];
    },
  },
  {
    id: 'internal_task_due_reminder',
    on: 'internal_tasks.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueNow(b) || overdue(b); },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      if (!row.assigned_to) return [];
      return [notifyC({
        audiences: [{ kind: 'user', userId: s(row.assigned_to) }], companyId: event.company_id, type: 'task_due',
        title: `Task ${whenText(bucket, due_date)}: ${s(row.title)}`,
        link:  { admin: '/tasks' },
      })];
    },
  },
];

function checklistTask(event: PlatformEvent, portalPath: string, kind: string): Consequence[] {
  const { bucket, due_date, row } = reminderPayload(event);
  if (!event.company_id) return [];
  return [notifyC({
    audiences: admins(event.company_id), companyId: event.company_id, type: 'checklist_task_due',
    title: `${kind} task ${whenText(bucket, due_date)}: ${s(row.task_title)}`,
    link:  { portal: portalPath },
  })];
}

export const RULES: Rule[] = [...rowRules, ...reminderRules];

export function rulesFor(key: string, rules: Rule[] = RULES): Rule[] {
  return rules.filter(r => r.on === key);
}
