import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceRequestReceivedEmail } from '@/lib/email';
import { portalUrl } from '@/lib/portalUrl';
import { CANDIDATE_CLIENT_STATUS_LABELS, type CandidateClientStatus } from '@/lib/ui/statusMaps';
import type { Audience, NotifyInput } from '@/lib/notify/notify';
import {
  changedTo, isOverdueWeekly, reminderPayload, rowPayload,
  type EventKey, type PlatformEvent, type ReminderBucket,
} from './types';
import { hsRules } from './hsRules';
import { leadRules } from './leadRules';
import { supportRules } from './supportRules';
import { hireRules } from './hireRules';
import { safetyRules } from './safetyRules';
import { workforceRules } from './workforceRules';
import { environmentalRules } from './environmentalRules';
import { legalRegisterRules } from './legalRegisterRules';
import { governanceRules } from './governanceRules';

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
/** A client action item, created once per sourceRef (unique index, 096). */
export type ActionConsequence = {
  kind: 'action';
  companyId: string;
  sourceRef: string;
  row: {
    action_type: string; title: string; description?: string | null; priority: 'low' | 'normal' | 'high' | 'urgent';
    related_entity_type?: string | null; related_entity_id?: string | null; due_date?: string | null; created_by_admin?: boolean;
    /** Phase 4 Group 4: a defect needs its severity + verification gate set at
     *  creation — 125's actions_lifecycle() refuses starting an action
     *  already 'awaiting_verification'/'complete', so this is the only
     *  point verification_required can be turned on for a fresh row. */
    severity?: 'low' | 'medium' | 'high' | 'critical'; source_type?: string; source_id?: string;
    verification_required?: boolean;
  };
};
export type Consequence = NotifyConsequence | EmailConsequence | RunConsequence | ActionConsequence;

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
    // The reminder payload never carries an embed (slimRow() in
    // lib/reminders/run.ts strips it), so the employee's name — needed
    // for a readable title since training_records links employee_id
    // rather than storing a free-text name — is looked up here, the
    // same way hsRules.ts's itemTitle() resolves a title by id.
    id: 'training_record_reminder',
    on: 'training_records.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: async ({ event, sb }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      const expired = bucket === 'overdue';
      const employeeId = s(row.employee_id);
      const personId = s(row.person_id);
      // A newer completion of the same course has replaced this record.
      if (personId && row.course_id) {
        const { data: newer } = await sb.from('training_records').select('id')
          .eq('person_id', personId).eq('course_id', s(row.course_id)).neq('id', s(row.id))
          .neq('verification_status', 'rejected').or(`expires_on.is.null,expires_on.gt.${s(row.expires_on)}`).limit(1);
        if ((newer ?? []).length) return [];
      }
      let employeeName = 'an employee';
      if (employeeId) {
        const { data } = await sb.from('employee_records').select('full_name').eq('id', employeeId).maybeSingle();
        employeeName = (data as { full_name?: string } | null)?.full_name ?? employeeName;
      } else if (personId) {
        // 134: a record added through the workforce pages has a person
        // and may have no employee record.
        const { data } = await sb.from('people').select('full_name').eq('id', personId).maybeSingle();
        employeeName = (data as { full_name?: string } | null)?.full_name ?? employeeName;
      }
      return [notifyC({
        audiences: admins(event.company_id ?? ''), companyId: event.company_id,
        type: expired ? 'training_record_expired' : 'training_record_expiring',
        title: `${s(row.course_name, 'Training')} for ${employeeName} ${expired ? `expired on ${due_date}` : `expires ${due_date}`}`,
        link:  { portal: '/lead/training-records' },
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
    // Core-OS 360 Phase 4 (154): an emergency plan's own review cycle.
    // STAFF-ONLY for now, the same reasoning as every other Phase 4
    // site-safety reminder without a portal page yet (Group 13 builds
    // it) — widen to admins() once that page exists.
    id: 'emergency_plan_review_reminder',
    on: 'emergency_plans.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'emergency_plan_review_due',
        title: `Review of "${s(row.title, 'an emergency plan')}" is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}` },
      })];
    },
  },
  {
    id: 'hs_document_review_reminder',
    on: 'hs_documents.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: 'hs_document_review_due',
        title: `Review of "${s(row.title, 'a document')}" is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}/documents`, portal: '/protect/documents' },
      })];
    },
  },
  {
    // Core-OS 360 Phase 5, Group 2 (157): an environmental permit's own
    // expiry. Client-facing (unlike Phase 4's H&S permits reminder) —
    // there is a real portal environmental-permits page for this.
    id: 'environmental_permit_reminder',
    on: 'environmental_permits.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: 'environmental_permit_status_changed',
        title: `Environmental permit "${s(row.permit_type, 'a permit')}" is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}/environmental-permits`, portal: '/protect/environmental-permits' },
      })];
    },
  },
  {
    // A permit condition's own review cycle. Never "compliance due" —
    // this is a recorded review date, not a legal deadline.
    id: 'permit_condition_reminder',
    on: 'permit_conditions.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date } = reminderPayload(event);
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: 'environmental_permit_condition_review',
        title: `A permit condition review is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}/environmental-permits`, portal: '/protect/environmental-permits' },
      })];
    },
  },
  {
    // Core-OS 360 Phase 5, Group 3 (158): a real, user-entered ISO
    // certificate's own recorded expiry — never a computed compliance
    // conclusion. The reminder payload never carries an embed
    // (slimRow() strips it), so the standard's name is looked up here,
    // the same way training_record_reminder resolves an employee name.
    id: 'iso_certification_reminder',
    on: 'iso_certifications.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: async ({ event, sb }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      const expired = bucket === 'overdue';
      let standardName = 'An ISO certification';
      const standardId = s(row.standard_id);
      if (standardId) {
        const { data } = await sb.from('management_system_standards').select('name').eq('id', standardId).maybeSingle();
        standardName = (data as { name?: string } | null)?.name ?? standardName;
      }
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: expired ? 'iso_certification_expired' : 'iso_certification_expiring',
        title: `${standardName} certificate ${s(row.certificate_number, '')} ${expired ? `expired on ${due_date}` : `expires ${due_date}`}`.replace(/\s+/g, ' ').trim(),
        link:  { admin: `/health-safety/${event.company_id}/iso`, portal: '/protect/iso-readiness' },
      })];
    },
  },
  {
    // Core-OS 360 Phase 5, Group 4 (159): a legal obligation's own
    // next_review_due — rolled forward from the newest compliance_
    // evaluations row by the database's own trigger (the 148a/PUWER
    // lesson: an insert-only history table cannot be read directly for
    // a reminder, or it fires once per historical row). Never
    // "compliance due" — a recorded review date, not a legal deadline.
    id: 'legal_obligation_review_reminder',
    on: 'organisation_legal_obligations.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: async ({ event, sb }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      const reqId = s(row.legal_requirement_id);
      let title = 'A legal requirement';
      if (reqId) {
        const { data } = await sb.from('legal_requirements').select('title').eq('id', reqId).maybeSingle();
        title = (data as { title?: string } | null)?.title ?? title;
      }
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: 'legal_obligation_review_due',
        title: `Legal register review of "${title}" is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}/legal`, portal: '/protect/legal-register' },
      })];
    },
  },
  {
    // Core-OS 360 Phase 5, Group 6 (161): an objective's own target_date
    // approaching or passed. Only draft/active/on_track/at_risk
    // objectives reach this reminder at all (the query already excludes
    // achieved/missed/abandoned) — a factual date nudge, never a
    // compliance verdict.
    id: 'objective_target_date_reminder',
    on: 'objectives.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      const overdue = bucket === 'overdue';
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id,
        type: overdue ? 'objective_missed' : 'objective_at_risk',
        title: `Objective "${s(row.title, 'An objective')}" target date is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}/objectives`, portal: '/protect/objectives' },
      })];
    },
  },
  {
    // Core-OS 360 Phase 5, Group 6 (161): a SCHEDULED management review's
    // own review_date approaching.
    id: 'management_review_date_reminder',
    on: 'management_reviews.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'due_0'; },
    then: ({ event }) => {
      const { bucket, due_date } = reminderPayload(event);
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: 'management_review_due',
        title: `Management review is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}/management-review`, portal: '/protect/management-review' },
      })];
    },
  },
  {
    id: 'hs_equipment_reminder',
    on: 'hs_equipment.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: 'hs_equipment_inspection_due',
        title: `Inspection of "${s(row.name, 'equipment')}" is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}/equipment`, portal: '/protect/equipment' },
      })];
    },
  },
  {
    // Core-OS 360 Phase 4 (148/148a): the PUWER review cycle, read from
    // hs_equipment.puwer_review_due_on (the rolled-forward column — see
    // 148a's own header comment for why this can't read
    // puwer_assessments directly). Copy is deliberately neutral: "review
    // due", never "compliance due" or "certification due" — a recorded
    // assessment is not a legal certification (Phase 4's standing rule).
    id: 'puwer_review_reminder',
    on: 'puwer_assessments.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: [...admins(event.company_id ?? ''), ...staffOnly], companyId: event.company_id, type: 'puwer_review_due',
        title: `PUWER review of "${s(row.name, 'equipment')}" is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}/equipment`, portal: '/protect/equipment' },
      })];
    },
  },
  {
    // Core-OS 360 Phase 4 (150): a contractor insurance policy expiring
    // or lapsed. The reminder row carries only contractor_id/insurance_
    // type (contractor_insurances has no name of its own) — looked up
    // here, the same "read once, don't embed" shape every other
    // reminder rule in this file already uses.
    // STAFF-ONLY for now: contractor management has no portal page yet
    // (Group 13 builds admin+portal UI) — a client-facing notification
    // with no page to link to is exactly the gap rules.test.ts's own
    // "every client notification has a portal link" check exists to
    // catch. Widen to admins() once that page exists.
    id: 'contractor_insurance_reminder',
    on: 'contractor_insurances.reminder',
    when: e => { const b = reminderPayload(e).bucket; return dueSoon(b) || b === 'overdue'; },
    then: async ({ event, sb }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      const { data } = await sb.from('contractors').select('name').eq('id', s(row.contractor_id)).maybeSingle();
      const name = (data as { name?: string } | null)?.name ?? 'a contractor';
      const type = s(row.insurance_type).replace(/_/g, ' ');
      return [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'contractor_insurance_expiring',
        title: `${name}'s ${type} insurance is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}` },
      })];
    },
  },
  {
    // Core-OS 360 Phase 4 (152): an issued permit approaching its own
    // expiry. STAFF-ONLY for now, the same reasoning as
    // contractor_insurance_reminder above — permits have no portal page
    // yet (Group 13 builds it).
    id: 'permit_reminder',
    on: 'permits.reminder',
    when: e => { const b = reminderPayload(e).bucket; return b === 'due_0' || b === 'overdue'; },
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      return [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'permit_expiring',
        title: `Permit ${s(row.permit_number, '')} is ${whenText(bucket, due_date)}`,
        link:  { admin: `/health-safety/${event.company_id}` },
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

export const RULES: Rule[] = [...rowRules, ...reminderRules, ...hsRules, ...leadRules, ...supportRules, ...hireRules, ...safetyRules, ...workforceRules, ...environmentalRules, ...legalRegisterRules, ...governanceRules];

export function rulesFor(key: string, rules: Rule[] = RULES): Rule[] {
  return rules.filter(r => r.on === key);
}
