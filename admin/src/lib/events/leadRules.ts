import { leaveDecisionEmail, leaveRequestedEmail } from '@/lib/email';
import { ABSENCE_TYPE_LABELS, labelFor } from '@/lib/ui/statusMaps';
import { startEmployment } from '@/lib/lead/startEmployment';
import { autoStartOnboarding, closeOutEmployee, scheduleProbationReview } from '@/lib/lead/onboarding';
import { sendPolicyAckLink } from '@/lib/lead/policyAckLink';
import { isOverdueWeekly } from './types';
import type { Audience } from '@/lib/notify/notify';
import type { Consequence, Rule } from './rules';
import type { PlatformEvent } from './types';
import { changedTo, reminderPayload, rowPayload } from './types';
import { notify } from '@/lib/notify/notify';

// LEAD / HR: what follows leave, hiring, onboarding, offboarding and
// documents. Every consequence is keyed; the domain writes (an
// employee record from a hire, an onboarding instance, a probation
// review) are idempotent by a unique column, so a re-run creates nothing.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const staffOnly: Audience[] = [{ kind: 'staff' }];
const admins  = (companyId: string): Audience[] => [{ kind: 'company_admins', companyId }];
const editors = (companyId: string): Audience[] => [{ kind: 'company_editors', companyId }];

const DECIDED = ['approved', 'rejected'] as const;

async function leaveEmailTarget(sb: { from: (t: string) => any }, absenceId: string) {
  const { data } = await sb.from('absence_records').select('id, employee_id, employee_name, employee_email, absence_type, start_date, end_date, days, status').eq('id', absenceId).maybeSingle();
  return data as { id: string; employee_id: string | null; employee_name: string; employee_email: string | null; absence_type: string; start_date: string; end_date: string | null; days: number | null; status: string } | null;
}

export const leadRules: Rule[] = [
  {
    // The manager hears at once; the employee (no login) gets a receipt.
    id: 'leave_requested',
    on: 'absence_records.created',
    when: e => rowPayload(e).new.status === 'pending',
    then: async ({ event, sb, companyName }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const type = labelFor(ABSENCE_TYPE_LABELS, s(n.absence_type), s(n.absence_type));
      const out: Consequence[] = [{
        kind: 'notify',
        input: {
          audiences: editors(event.company_id), companyId: event.company_id, type: 'leave_requested', urgent: true,
          title: `${s(n.employee_name, 'An employee')} requested ${type.toLowerCase()}: ${s(n.start_date)}${n.end_date && n.end_date !== n.start_date ? ` to ${s(n.end_date)}` : ''}`,
          body:  n.days ? `${s(n.days)} day${Number(n.days) === 1 ? '' : 's'} · awaiting your decision` : 'Awaiting your decision',
          link:  { portal: '/lead/absence' },
        },
      }];
      const row = await leaveEmailTarget(sb, s(event.entity_id));
      if (row?.employee_email) {
        out.push({
          kind: 'email', to: row.employee_email,
          target: { type: 'employee', id: row.employee_id ?? row.id },
          message: leaveRequestedEmail({ employeeName: row.employee_name, companyName: await companyName(), typeLabel: type, startDate: row.start_date, endDate: row.end_date, days: row.days }),
        });
      }
      return out;
    },
  },
  {
    // The decision reaches the employee; a refusal carries the manager's
    // reason, which the deny route writes to employee_notes and nothing
    // read until now.
    id: 'leave_decided',
    on: 'absence_records.updated',
    when: e => changedTo(e, 'status', DECIDED),
    then: async ({ event, sb, companyName }) => {
      const { new: n } = rowPayload(event);
      const row = await leaveEmailTarget(sb, s(event.entity_id));
      if (!row?.employee_email) return [];
      const approved = s(n.status) === 'approved';
      let reason: string | null = null;
      if (!approved) {
        const { data: note } = await sb.from('employee_notes').select('body').eq('note_type', 'leave_denied').eq('related_id', row.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        reason = (note as { body?: string } | null)?.body ?? null;
      }
      const type = labelFor(ABSENCE_TYPE_LABELS, row.absence_type, row.absence_type);
      return [{
        kind: 'email', to: row.employee_email,
        target: { type: 'employee', id: row.employee_id ?? row.id },
        message: leaveDecisionEmail({ employeeName: row.employee_name, companyName: await companyName(), typeLabel: type, startDate: row.start_date, endDate: row.end_date, days: row.days, approved, reason }),
      }];
    },
  },
  {
    id: 'hired_candidate_to_employee',
    on: 'candidates.updated',
    when: e => changedTo(e, 'client_status', ['hired']),
    then: ({ event }) => [hireConsequence(s(event.entity_id))],
  },
  {
    id: 'accepted_offer_to_employee',
    on: 'offers.updated',
    when: e => changedTo(e, 'status', ['written_accepted']) && !!rowPayload(e).new.candidate_id,
    then: ({ event }) => [hireConsequence(s(rowPayload(event).new.candidate_id))],
  },
  {
    // The employee record is the join point: created by the consumer
    // from a hire, or by the client's own form. Either way onboarding
    // starts from the default template.
    id: 'onboarding_autostart',
    on: 'employee_records.created',
    when: e => rowPayload(e).new.status !== 'terminated',
    then: async ({ event, sb }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const r = await autoStartOnboarding(sb, s(event.entity_id));
      const out: Consequence[] = [];
      if (r.started) {
        out.push({
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'onboarding_started',
            title: `Onboarding started for ${s(n.full_name, 'a new starter')}`,
            body:  `${r.taskCount ?? 0} task${r.taskCount === 1 ? '' : 's'} from your default template, due from ${s(n.start_date)}.`,
            link:  { portal: '/lead/onboarding' },
          },
        });
      }
      if (n.source_candidate_id) {
        out.push({
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'role_filled',
            title: `${s(n.full_name, 'A candidate')} is now an employee: ${s(n.job_title)}`,
            link:  { admin: `/clients/${event.company_id}` },
          },
        });
      }
      return out;
    },
  },
  {
    // Onboarding finished, or probation ends within 30 days: one
    // probation review, due a week before.
    id: 'probation_review_on_onboarding_complete',
    on: 'onboarding_instances.updated',
    when: e => changedTo(e, 'status', ['completed']) && !!rowPayload(e).new.employee_id,
    then: ({ event }) => [probationConsequence(event.company_id, s(rowPayload(event).new.employee_id))],
  },
  {
    id: 'probation_review_on_reminder',
    on: 'employee_records.reminder',
    when: e => reminderPayload(e).bucket === 'due_30',
    then: ({ event }) => [probationConsequence(event.company_id, s(event.entity_id))],
  },
  {
    id: 'offboarding_started',
    on: 'offboarding_instances.created',
    then: async ({ event, sb }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const { data: emp } = await sb.from('employee_records').select('full_name').eq('id', s(n.employee_id)).maybeSingle();
      return [{
        kind: 'notify',
        input: {
          audiences: [...admins(event.company_id), ...staffOnly], companyId: event.company_id, type: 'offboarding_started',
          title: `Offboarding started for ${(emp as { full_name?: string } | null)?.full_name ?? 'an employee'}`,
          body:  `${n.last_working_day ? `Last working day ${s(n.last_working_day)}` : 'No last working day set'}${n.reason ? ` · ${s(n.reason).replace(/_/g, ' ')}` : ''}`,
          link:  { portal: '/lead/offboarding', admin: `/clients/${event.company_id}` },
        },
      }];
    },
  },
  {
    // Terminated (by the reminders cron on the last working day, or by
    // hand): pending leave after the end date and open acknowledgements
    // are closed, and the client is told.
    id: 'employee_left',
    on: 'employee_records.updated',
    when: e => changedTo(e, 'status', ['terminated']),
    then: async ({ event, sb }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const closed = await closeOutEmployee(sb, s(event.entity_id), n.end_date ? s(n.end_date) : null);
      return [{
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'employee_left',
          title: `${s(n.full_name, 'An employee')} has left`,
          body:  [closed.absences ? `${closed.absences} pending leave request${closed.absences === 1 ? '' : 's'} cancelled` : null, closed.acks ? `${closed.acks} policy acknowledgement${closed.acks === 1 ? '' : 's'} closed` : null].filter(Boolean).join(' · ') || 'Their leave link no longer works.',
          link:  { portal: '/lead/employee-records' },
        },
      }];
    },
  },
  {
    id: 'document_uploaded_by_client',
    on: 'documents.created',
    when: e => e.actor_kind === 'client',
    then: async ({ event, companyName }) => [{
      kind: 'notify',
      input: {
        audiences: staffOnly, companyId: event.company_id, type: 'document_uploaded',
        title: `${await companyName() || 'A client'} uploaded: ${s(rowPayload(event).new.name, 'a document')}`,
        link:  { admin: `/clients/${event.company_id}` },
      },
    }],
  },
  {
    id: 'document_shared_by_staff',
    on: 'documents.created',
    when: e => e.actor_kind === 'staff' || e.actor_kind === 'system',
    then: ({ event }) => event.company_id ? [{
      kind: 'notify',
      input: {
        audiences: admins(event.company_id), companyId: event.company_id, type: 'document_shared',
        title: `New document from Core OS 360: ${s(rowPayload(event).new.name, 'a document')}`,
        link:  { portal: '/lead/documents' },
      },
    }] : [],
  },
  {
    id: 'document_approved',
    on: 'documents.updated',
    when: e => changedTo(e, 'approved_at') && !!rowPayload(e).new.approved_at,
    then: ({ event }) => event.company_id ? [{
      kind: 'notify',
      input: {
        audiences: admins(event.company_id), companyId: event.company_id, type: 'document_approved',
        title: `Approved: ${s(rowPayload(event).new.name, 'a document')}`,
        link:  { portal: '/lead/documents' },
      },
    }] : [],
  },
  {
    // Request sign-off: the row is created pending (or re-requested:
    // an existing row set back to pending) and the employee gets the link.
    id: 'policy_ack_requested',
    on: 'policy_acknowledgements.created',
    when: e => rowPayload(e).new.status === 'pending',
    then: ({ event }) => [policyAckLinkConsequence(event, `policy_ack_link:${s(event.entity_id)}:${event.id}`, false)],
  },
  {
    id: 'policy_ack_rerequested',
    on: 'policy_acknowledgements.updated',
    when: e => changedTo(e, 'status', ['pending']),
    then: ({ event }) => [policyAckLinkConsequence(event, `policy_ack_link:${s(event.entity_id)}:${event.id}`, false)],
  },
  {
    // The portal's Resend button emits this (service role, company from
    // the session); each press is a fresh link.
    id: 'policy_ack_resend',
    on: 'policy_ack_resend.created',
    then: ({ event }) => [policyAckLinkConsequence(event, `policy_ack_link:${s(event.entity_id)}:${event.id}`, true)],
  },
  {
    // Overdue: the admins already hear (policy_ack_reminder in rules.ts);
    // the employee is nudged too, weekly.
    id: 'policy_ack_employee_nudge',
    on: 'policy_acknowledgements.reminder',
    when: e => { const b = reminderPayload(e).bucket; return b === 'overdue' || isOverdueWeekly(b); },
    then: ({ event }) => [policyAckLinkConsequence(event, `policy_ack_link:${s(event.entity_id)}:${reminderPayload(event).bucket}`, true)],
  },
  {
    id: 'policy_ack_signed',
    on: 'policy_acknowledgements.updated',
    when: e => changedTo(e, 'status', ['acknowledged']) && e.actor_kind === 'system',
    then: async ({ event, sb }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const [{ data: emp }, { data: doc }] = await Promise.all([
        sb.from('employee_records').select('full_name').eq('id', s(n.employee_id)).maybeSingle(),
        sb.from('documents').select('name').eq('id', s(n.document_id)).maybeSingle(),
      ]);
      return [{
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'policy_ack_signed',
          title: `${(emp as { full_name?: string } | null)?.full_name ?? 'An employee'} acknowledged ${(doc as { name?: string } | null)?.name ?? 'a policy'}`,
          link:  { portal: '/lead/policy-acknowledgements' },
        },
      }];
    },
  },
];

// A sign-off request reaches the employee as a personal link. One
// consequence per trigger, keyed on the EVENT so a resend or a weekly
// overdue reminder is a fresh email, and a re-processed event is not.
function policyAckLinkConsequence(event: PlatformEvent, key: string, reminder: boolean): Consequence {
  const ackId = s(event.entity_id);
  return {
    kind: 'run', label: `policy ack link ${ackId}`,
    fn: async (sb) => {
      const r = await sendPolicyAckLink(sb, ackId, key, { reminder });
      if (r.outcome === 'no_email' && event.company_id) {
        await notify(sb, {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'policy_ack_needs_email',
          title: `${r.employeeName ?? 'An employee'} has no email address, so their policy link was not sent`,
          body:  'Add an email on their employee record and press Resend link.',
          link:  { portal: '/lead/employee-records' },
          dedupeKey: `policy_ack_needs_email:${ackId}`,
        });
      }
    },
  };
}

function hireConsequence(candidateId: string): Consequence {
  return { kind: 'run', label: `start employment for ${candidateId}`, fn: async (sb) => { await startEmployment(sb, candidateId); } };
}

function probationConsequence(companyId: string | null, employeeId: string): Consequence {
  return {
    kind: 'run', label: `probation review for ${employeeId}`,
    fn: async (sb) => {
      const created = await scheduleProbationReview(sb, employeeId);
      if (!created || !companyId) return;
      const { data: emp } = await sb.from('employee_records').select('full_name, probation_end').eq('id', employeeId).maybeSingle();
      const e = emp as { full_name?: string; probation_end?: string } | null;
      const { notify } = await import('@/lib/notify/notify');
      await notify(sb, {
        audiences: admins(companyId), companyId, type: 'probation_review_scheduled',
        title: `Probation review scheduled for ${e?.full_name ?? 'an employee'}`,
        body:  e?.probation_end ? `Probation ends ${e.probation_end}; the review is due a week before.` : null,
        link:  { portal: '/lead/reviews' },
        dedupeKey: `probation_review:${employeeId}`,
      });
    },
  };
}
