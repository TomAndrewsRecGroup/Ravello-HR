import type { SupabaseClient } from '@supabase/supabase-js';
import { askJev } from '@/lib/jev/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { notify, type Audience } from '@/lib/notify/notify';
import { HIRING_STAGE_LABELS, labelFor } from '@/lib/ui/statusMaps';
import { daysUntil } from '@/lib/hs/recurrence';
import { isoWeek } from '@/lib/hs/weeklySummary';
import { syncInterviewCalendar } from '@/lib/hiring/interviewCalendar';
import { FEEDBACK_GATE, feedbackReasonQuestions, feedbackReasonState, toFeedbackTriage } from '@/lib/hiring/jevQuestions';
import type { Consequence, NotifyConsequence, Rule } from './rules';
import { changedTo, isOverdueWeekly, reminderPayload, rowPayload, type PlatformEvent } from './types';

// HIRE: what follows a role moving, a candidate being shared, an
// interview being booked, an offer going out or coming back, and the
// dates nobody watched — a role with no movement, an offer past its
// deadline, a referral queue nobody reviewed, a scan that failed.
//
// Everything a client is told comes from a STAFF write (the admin
// requisition panel, the candidates tab, the interview scheduler); a
// client's own write is already covered by candidate_decided / the
// offer decision below, which tell staff. The one Jev question here
// reads text a client typed, so its answer is written to
// candidates.feedback_triage and shown as a chip; it changes nothing.

type Sb = SupabaseClient;
const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const notifyC = (input: NotifyConsequence['input']): NotifyConsequence => ({ kind: 'notify', input });
const staffOnly: Audience[] = [{ kind: 'staff' }];
const admins = (companyId: string): Audience[] => [{ kind: 'company_admins', companyId }];
const notClient = (e: PlatformEvent) => e.actor_kind !== 'client';

const STAGE_BODY: Record<string, string> = {
  in_progress:     'We are now sourcing candidates for this role.',
  shortlist_ready: 'A shortlist is ready for your review.',
  interview:       'Interviews are under way.',
  offer:           'An offer is out to a candidate.',
  filled:          'The role is filled.',
  cancelled:       'The role has been cancelled.',
};

export const OFFER_DECIDED = ['verbal_accepted', 'written_accepted', 'declined', 'withdrawn', 'lapsed'] as const;
const OFFER_DECIDED_LABEL: Record<string, string> = {
  verbal_accepted: 'verbally accepted', written_accepted: 'accepted in writing', declined: 'declined', withdrawn: 'withdrawn', lapsed: 'lapsed',
};

/** Stale after this many days without a stage change. */
export const STALE_ROLE_DAYS = 14;
/** A referral sitting in review_pending longer than this is nagged. */
export const REFERRAL_REVIEW_DAYS = 2;

async function candidateName(sb: Sb, id: string | null): Promise<string> {
  if (!id) return 'A candidate';
  const { data } = await sb.from('candidates').select('full_name').eq('id', id).maybeSingle();
  return (data as { full_name?: string } | null)?.full_name ?? 'A candidate';
}
async function roleTitle(sb: Sb, id: string | null): Promise<string> {
  if (!id) return 'a role';
  const { data } = await sb.from('requisitions').select('title').eq('id', id).maybeSingle();
  return (data as { title?: string } | null)?.title ?? 'a role';
}

/** Jev reads the client's rejection feedback; the result is written to
 *  candidates.feedback_triage and nowhere else. */
export async function triageCandidateFeedback(sb: Sb, candidateId: string, companyId: string | null): Promise<void> {
  const { data } = await sb.from('candidates').select('id, company_id, requisition_id, client_status, client_feedback, feedback_triage').eq('id', candidateId).maybeSingle();
  const c = data as { id: string; company_id: string | null; requisition_id: string | null; client_status: string | null; client_feedback: string | null; feedback_triage: unknown } | null;
  if (!c || c.feedback_triage || !c.client_feedback?.trim()) return;
  const result = await askJev(sb, {
    kind: 'candidate_feedback_reason', companyId: companyId ?? c.company_id, entityType: 'candidate', entityId: c.id,
    actor: { id: null, kind: 'system' },
    state: feedbackReasonState({ client_status: c.client_status, client_feedback: c.client_feedback, role_title: await roleTitle(sb, c.requisition_id) }),
    questions: feedbackReasonQuestions(), gate: FEEDBACK_GATE,
  });
  if (!result) return;
  const selected: Record<string, string | number> = {};
  for (const [k, a] of Object.entries(result.answers)) selected[k] = a.type === 'noul' ? a.probability : a.selected;
  const triage = toFeedbackTriage(selected, result.confidence, result.gated, result.decisionId, new Date());
  const res = await sb.from('candidates').update({ feedback_triage: triage }, COUNT_EXACT).eq('id', c.id);
  judgeWrite({ error: res.error, count: res.count });
}

function interviewNote(event: PlatformEvent, rescheduled: boolean): Consequence[] {
  const { new: n } = rowPayload(event);
  if (!event.company_id) return [];
  const id = s(event.entity_id);
  return [{
    kind: 'run', label: `interview ${id} → calendar + client`,
    fn: async (sb) => {
      await syncInterviewCalendar(sb, id);
      const [who, role] = await Promise.all([candidateName(sb, s(n.candidate_id, '') || null), roleTitle(sb, s(n.requisition_id, '') || null)]);
      const when = n.scheduled_at ? new Date(s(n.scheduled_at)).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }) : 'time to be confirmed';
      await notify(sb, {
        audiences: admins(event.company_id!), companyId: event.company_id, type: 'interview_scheduled', urgent: true,
        title: `${rescheduled ? 'Interview moved' : 'Interview booked'}: ${who} · ${role}`,
        body:  `${when}${n.stage_label ? ` · ${s(n.stage_label)}` : ''}${n.interview_type ? ` · ${s(n.interview_type).replace(/_/g, ' ')}` : ''}. It is on your calendar.`,
        link:  { portal: '/calendar' },
        dedupeKey: `interview_${rescheduled ? 'moved' : 'booked'}:${event.id}`,
      });
    },
  }];
}

export const hireRules: Rule[] = [
  {
    // Staff moved the role; the client sees the funnel move.
    id: 'role_stage_changed',
    on: 'requisitions.updated',
    when: e => notClient(e) && changedTo(e, 'stage') && rowPayload(e).new.stage !== 'submitted',
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const stage = s(n.stage);
      return [notifyC({
        audiences: admins(event.company_id), companyId: event.company_id, type: 'role_stage_changed', urgent: true,
        title: `${s(n.title, 'Your role')}: ${labelFor(HIRING_STAGE_LABELS, stage, stage)}`,
        body:  STAGE_BODY[stage] ?? `The role moved to ${stage.replace(/_/g, ' ')}.`,
        link:  { portal: `/hire/hiring/${event.entity_id}` },
      })];
    },
  },
  {
    // The admin "Send to client" toggle. The client had to notice the row.
    id: 'candidate_shared',
    on: 'candidates.updated',
    when: e => notClient(e) && changedTo(e, 'approved_for_client', ['true']),
    then: ({ event }) => candidateShared(event),
  },
  {
    id: 'candidate_shared_on_create',
    on: 'candidates.created',
    when: e => notClient(e) && String(rowPayload(e).new.approved_for_client) === 'true',
    then: ({ event }) => candidateShared(event),
  },
  {
    // A client's rejection with feedback: Jev names the reason for the
    // recruiter. Recommendation only (feedback_triage).
    id: 'candidate_feedback_reason',
    on: 'candidates.updated',
    when: e => e.actor_kind === 'client' && changedTo(e, 'client_status', ['rejected']),
    then: ({ event }) => [{
      kind: 'run', label: `feedback reason ${event.entity_id}`,
      fn: sb => triageCandidateFeedback(sb, s(event.entity_id), event.company_id),
    }],
  },
  {
    id: 'interview_scheduled',
    on: 'interview_schedules.created',
    when: e => notClient(e) && rowPayload(e).new.status === 'scheduled' && !!rowPayload(e).new.scheduled_at,
    then: ({ event }) => interviewNote(event, false),
  },
  {
    id: 'interview_rescheduled',
    on: 'interview_schedules.updated',
    when: e => notClient(e) && changedTo(e, 'scheduled_at') && !!rowPayload(e).new.scheduled_at && rowPayload(e).new.status !== 'cancelled',
    then: ({ event }) => interviewNote(event, true),
  },
  {
    id: 'interview_cancelled',
    on: 'interview_schedules.updated',
    when: e => notClient(e) && changedTo(e, 'status', ['cancelled']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const id = s(event.entity_id);
      return [{
        kind: 'run', label: `interview ${id} cancelled`,
        fn: async (sb) => {
          await syncInterviewCalendar(sb, id);
          const [who, role] = await Promise.all([candidateName(sb, s(n.candidate_id, '') || null), roleTitle(sb, s(n.requisition_id, '') || null)]);
          await notify(sb, {
            audiences: admins(event.company_id!), companyId: event.company_id, type: 'interview_cancelled', urgent: true,
            title: `Interview cancelled: ${who} · ${role}`,
            body:  'It has been removed from your calendar.',
            link:  { portal: `/hire/hiring/${s(n.requisition_id)}` },
            dedupeKey: `interview_cancelled:${event.id}`,
          });
        },
      }];
    },
  },
  {
    id: 'offer_sent',
    on: 'offers.updated',
    when: e => notClient(e) && changedTo(e, 'status', ['sent']),
    then: ({ event, sb }) => offerSent(event, sb),
  },
  {
    id: 'offer_sent_on_create',
    on: 'offers.created',
    when: e => notClient(e) && rowPayload(e).new.status === 'sent',
    then: ({ event, sb }) => offerSent(event, sb),
  },
  {
    // The side that did not decide is told. Written acceptance also
    // starts employment (leadRules.accepted_offer_to_employee).
    id: 'offer_decided',
    on: 'offers.updated',
    when: e => changedTo(e, 'status', OFFER_DECIDED),
    then: async ({ event, sb }) => {
      const { new: n } = rowPayload(event);
      const who = await candidateName(sb, s(n.candidate_id, '') || null);
      const role = await roleTitle(sb, s(n.requisition_id, '') || null);
      const what = OFFER_DECIDED_LABEL[s(n.status)] ?? s(n.status);
      const byClient = event.actor_kind === 'client';
      if (!byClient && !event.company_id) return [];
      return [notifyC({
        audiences: byClient ? staffOnly : admins(event.company_id!), companyId: event.company_id, type: 'offer_decided', urgent: true,
        title: `Offer ${what}: ${who} · ${role}`,
        body:  byClient ? 'Recorded by the client.' : 'Recorded by your consultant.',
        link:  { admin: `/hiring/${s(n.requisition_id)}`, portal: `/hire/hiring/${s(n.requisition_id)}` },
      })];
    },
  },
  {
    // The hourly cron failed. Once a day, not once an hour.
    id: 'referral_scan_failed',
    on: 'referral_scan_runs.created',
    when: e => rowPayload(e).new.ok === false,
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const day = s(event.occurred_at).slice(0, 10);
      return [{
        kind: 'run', label: `referral scan failed ${day}`,
        fn: sb => notify(sb, {
          audiences: staffOnly, companyId: null, type: 'referral_scan_failed', urgent: true,
          title: `Referral scan failed: ${s(n.outcome, 'error')}`,
          body:  `The hourly referral scan reported ${s(n.outcome, 'an error')}. No applicants are being processed until it runs clean.`,
          link:  { admin: '/referrals' },
          dedupeKey: `referral_scan_failed:${day}`,
        }).then(() => undefined),
      }];
    },
  },

  // ── reminders ─────────────────────────────────────────────────
  {
    // No stage change for STALE_ROLE_DAYS: a nag to staff, then weekly.
    id: 'reminder_role_stale',
    on: 'requisitions.reminder',
    when: e => { const b = reminderPayload(e).bucket; return b === 'overdue' || isOverdueWeekly(b); },
    then: ({ event }) => {
      const { row, due_date } = reminderPayload(event);
      const stale = STALE_ROLE_DAYS - daysUntil(due_date, s(event.occurred_at).slice(0, 10));
      return [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'role_stale',
        title: `No movement on ${s(row.title, 'a role')} for ${stale} days`,
        body:  `${row.assigned_recruiter ? `Assigned to ${s(row.assigned_recruiter)}. ` : ''}Move the stage, update the client, or cancel the role.`,
        link:  { admin: `/hiring/${event.entity_id}` },
      })];
    },
  },
  {
    id: 'reminder_offer_deadline',
    on: 'offers.reminder',
    then: async ({ event, sb }) => {
      const { row, bucket, due_date } = reminderPayload(event);
      const who = await candidateName(sb, s(row.candidate_id, '') || null);
      const role = await roleTitle(sb, s(row.requisition_id, '') || null);
      const past = bucket === 'overdue' || isOverdueWeekly(bucket);
      const title = bucket === 'due_7' ? `Offer to ${who} expires in a week (${due_date})`
        : bucket === 'due_0' ? `Offer to ${who} expires today`
        : `Offer to ${who} expired ${due_date} and is still marked ${s(row.status).replace(/_/g, ' ')}`;
      const out: Consequence[] = [notifyC({
        audiences: staffOnly, companyId: event.company_id, type: 'offer_deadline', urgent: past,
        title, body: `${role}. Chase the candidate, extend the deadline, or record the outcome.`,
        link:  { admin: `/hiring/${s(row.requisition_id)}` },
      })];
      if (!past && event.company_id) {
        out.push(notifyC({
          audiences: admins(event.company_id), companyId: event.company_id, type: 'offer_deadline',
          title, body: `${role}.`,
          link:  { portal: `/hire/hiring/${s(row.requisition_id)}` },
        }));
      }
      return out;
    },
  },
  {
    // One note per role per week while a review backlog exists, however
    // many rows the reminders cron emits for it.
    id: 'reminder_referral_review_pending',
    on: 'referral_applications.reminder',
    when: e => { const b = reminderPayload(e).bucket; return b === 'overdue' || isOverdueWeekly(b); },
    then: ({ event }) => {
      const { row } = reminderPayload(event);
      const reqId = s(row.requisition_id);
      return [{
        kind: 'run', label: `referral backlog ${reqId}`,
        fn: async (sb) => {
          const { count } = await sb.from('referral_applications').select('id', { count: 'exact', head: true }).eq('requisition_id', reqId).eq('status', 'review_pending');
          const n = count ?? 0;
          if (n === 0) return;
          const role = await roleTitle(sb, reqId);
          await notify(sb, {
            audiences: staffOnly, companyId: event.company_id, type: 'referral_review_pending',
            title: `${n} referral${n === 1 ? '' : 's'} awaiting your review: ${role}`,
            body:  `The oldest has waited more than ${REFERRAL_REVIEW_DAYS} days. Approve or reject them on the Referrals page.`,
            link:  { admin: '/referrals' },
            dedupeKey: `referral_review_pending:${reqId}:${isoWeek(new Date(event.occurred_at))}`,
          });
        },
      }];
    },
  },
];

function candidateShared(event: PlatformEvent): Consequence[] {
  const { new: n } = rowPayload(event);
  if (!event.company_id) return [];
  return [notifyC({
    audiences: admins(event.company_id), companyId: event.company_id, type: 'candidate_shared', urgent: true,
    title: `New candidate to review: ${s(n.full_name, 'a candidate')}`,
    body:  'Your consultant has shared a candidate. Approve, request more information, or pass.',
    link:  { portal: `/hire/hiring/${s(n.requisition_id)}` },
  })];
}

async function offerSent(event: PlatformEvent, sb: Sb): Promise<Consequence[]> {
  const { new: n } = rowPayload(event);
  if (!event.company_id) return [];
  const who = await candidateName(sb, s(n.candidate_id, '') || null);
  const role = await roleTitle(sb, s(n.requisition_id, '') || null);
  return [notifyC({
    audiences: admins(event.company_id), companyId: event.company_id, type: 'offer_sent', urgent: true,
    title: `Offer sent: ${who} · ${role}`,
    body:  [n.deadline ? `Deadline ${s(n.deadline)}` : null, n.start_date ? `proposed start ${s(n.start_date)}` : null].filter(Boolean).join(' · ') || 'Awaiting the candidate\'s response.',
    link:  { portal: `/hire/hiring/${s(n.requisition_id)}` },
  })];
}
