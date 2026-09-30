import type { SupabaseClient } from '@supabase/supabase-js';
import type { Audience } from '@/lib/notify/notify';
import type { Consequence, NotifyConsequence, Rule } from './rules';
import { reminderPayload, rowPayload, type ReminderBucket } from './types';

// WORKFORCE — Core-OS 360 Phase 3 (134-137): who hears about what.
//
// Every audience is a CAPABILITY in the organisation (workforce.read,
// workforce.manage, occupational_health.summary.read), never "all
// admins". Every title is the person's name plus a catalogue title the
// organisation chose (a course, a credential type). NEVER a medical
// outcome, a restriction, a reason text or a Safe to Deploy reason:
// the outbox trigger on deployment_status_log (137) carries statuses
// only, and the reminder payloads (lib/reminders/rules.ts) carry ids
// and dates only. workforceRules.test.ts pins that.
//
// Nothing here changes a status. Safe to Deploy is calculated by the
// database from evidence; a notification only points a person at it.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const cap = (companyId: string, capability: string): Audience => ({ kind: 'capability', companyId, capability });
const notifyC = (input: NotifyConsequence['input']): NotifyConsequence => ({ kind: 'notify', input });

export const personPath = (personId: string) => `/lead/workforce/people/${personId}`;

const DEPLOYABLE = ['READY', 'CONDITIONALLY_READY'];

async function personName(sb: SupabaseClient, id: unknown): Promise<string> {
  if (!id) return 'A worker';
  const { data } = await sb.from('people').select('full_name').eq('id', String(id)).maybeSingle();
  return (data as { full_name?: string } | null)?.full_name ?? 'A worker';
}

async function titleOf(sb: SupabaseClient, table: string, id: unknown, fallback: string): Promise<string> {
  if (!id) return fallback;
  const { data } = await sb.from(table).select('title').eq('id', String(id)).maybeSingle();
  return (data as { title?: string } | null)?.title ?? fallback;
}

async function siteNameOf(sb: SupabaseClient, id: unknown, fallback: string): Promise<string> {
  if (!id) return fallback;
  const { data } = await sb.from('hs_sites').select('name').eq('id', String(id)).maybeSingle();
  return (data as { name?: string } | null)?.name ?? fallback;
}

const soonOrOverdue = (b: ReminderBucket) => b === 'due_30' || b === 'due_7' || b === 'due_0' || b === 'overdue';
const whenText = (bucket: ReminderBucket, due: string) =>
  bucket === 'overdue' || bucket.startsWith('overdue_w') ? `expired on ${due}` : bucket === 'due_0' ? 'expires today' : `expires ${due}`;

/** True when a newer row for the same person and item has replaced this one. */
async function superseded(
  sb: SupabaseClient, table: string, row: Record<string, unknown>, itemCol: string, dateCol: string,
  extra?: (q: any) => any,
): Promise<boolean> {
  let q = sb.from(table).select('id').eq('person_id', s(row.person_id)).eq(itemCol, s(row[itemCol])).neq('id', s(row.id));
  if (extra) q = extra(q);
  const { data } = await q.or(`${dateCol}.is.null,${dateCol}.gt.${s(row[dateCol])}`).limit(1);
  return (data ?? []).length > 0;
}

export const workforceRules: Rule[] = [
  {
    // A person who was deployable no longer is. The first calculation
    // (from nothing) never notifies: it would announce every gap at once.
    id: 'workforce_not_ready',
    on: 'deployment_status_log.created',
    when: e => {
      const { new: n } = rowPayload(e);
      return n.to_status === 'NOT_READY' && DEPLOYABLE.includes(s(n.from_status));
    },
    then: async ({ event, sb }): Promise<Consequence[]> => {
      const { new: n } = rowPayload(event);
      if (!event.company_id || !n.person_id) return [];
      const name = await personName(sb, n.person_id);
      return [notifyC({
        audiences: [cap(event.company_id, 'workforce.read')], companyId: event.company_id, type: 'workforce_not_ready',
        title: `${name} is no longer ready to deploy`,
        body: 'Open their Safe to Deploy status to see what changed.',
        link: { portal: personPath(s(n.person_id)) },
        urgent: true,
      })];
    },
  },
  {
    id: 'workforce_credential_reminder',
    on: 'person_credentials.reminder',
    when: e => soonOrOverdue(reminderPayload(e).bucket),
    then: async ({ event, sb }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      if (!event.company_id) return [];
      if (await superseded(sb, 'person_credentials', row, 'credential_type_id', 'expires_on', q => q.neq('verification_status', 'rejected'))) return [];
      const [name, what] = await Promise.all([personName(sb, row.person_id), titleOf(sb, 'credential_types', row.credential_type_id, 'A licence or certificate')]);
      return [notifyC({
        audiences: [cap(event.company_id, 'workforce.manage')], companyId: event.company_id, type: 'workforce_evidence_expiring',
        title: `${what} for ${name} ${whenText(bucket, due_date)}`,
        link: { portal: personPath(s(row.person_id)) },
      })];
    },
  },
  {
    id: 'workforce_authorisation_reminder',
    on: 'person_authorisations.reminder',
    when: e => soonOrOverdue(reminderPayload(e).bucket),
    then: async ({ event, sb }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      if (!event.company_id) return [];
      if (await superseded(sb, 'person_authorisations', row, 'authorisation_type_id', 'expires_on', q => q.eq('status', 'active'))) return [];
      const [name, what] = await Promise.all([personName(sb, row.person_id), titleOf(sb, 'authorisation_types', row.authorisation_type_id, 'An authorisation')]);
      return [notifyC({
        audiences: [cap(event.company_id, 'workforce.manage')], companyId: event.company_id, type: 'workforce_evidence_expiring',
        title: `${what} for ${name} ${whenText(bucket, due_date)}`,
        link: { portal: personPath(s(row.person_id)) },
      })];
    },
  },
  {
    // The approver chose a date; when it arrives the person is judged
    // without it. Say so a week ahead and on the day.
    id: 'workforce_exception_lapsing',
    on: 'requirement_exceptions.reminder',
    when: e => { const b = reminderPayload(e).bucket; return b === 'due_7' || b === 'due_0'; },
    then: async ({ event, sb }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      if (!event.company_id) return [];
      const name = await personName(sb, row.person_id);
      return [notifyC({
        audiences: [cap(event.company_id, 'deployment.exception.approve'), cap(event.company_id, 'workforce.manage')],
        companyId: event.company_id, type: 'workforce_exception_lapsing',
        title: `A deployment exception for ${name} ${bucket === 'due_0' ? 'ends today' : `ends ${due_date}`}`,
        link: { portal: personPath(s(row.person_id)) },
      })];
    },
  },
  {
    // Occupational health: only that a review is due. Never the last
    // outcome, never the requirement's category.
    id: 'occupational_health_review_reminder',
    on: 'person_health_outcomes.reminder',
    when: e => soonOrOverdue(reminderPayload(e).bucket),
    then: async ({ event, sb }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      if (!event.company_id) return [];
      const { data: latest } = await sb.from('person_health_outcomes').select('id')
        .eq('person_id', s(row.person_id)).eq('requirement_id', s(row.requirement_id))
        .order('assessed_on', { ascending: false }).order('created_at', { ascending: false }).limit(1);
      if ((latest ?? [])[0] && (latest as { id: string }[])[0].id !== s(row.id)) return [];
      const name = await personName(sb, row.person_id);
      const overdue = bucket === 'overdue' || bucket.startsWith('overdue_w');
      return [notifyC({
        audiences: [cap(event.company_id, 'occupational_health.manage')], companyId: event.company_id,
        type: 'occupational_health_review_due',
        title: `Occupational health review for ${name} ${overdue ? `was due on ${due_date}` : `is due ${due_date}`}`,
        link: { portal: personPath(s(row.person_id)) },
      })];
    },
  },
  {
    // Core-OS 360 Completion Programme, Phase 26, Group 3 (C14.8). A
    // person still checked in (site_checkins.checked_out_at still
    // null) the morning after they checked in — attendance, never Safe
    // to Deploy: this never touches deployment status, only points a
    // manager at the roster. Skipped if they have since been checked
    // out (a re-processed event, or the cron catching up after this
    // row's own closure).
    id: 'workforce_stale_checkin',
    on: 'site_checkins.reminder',
    when: e => { const b = reminderPayload(e).bucket; return b === 'overdue' || b.startsWith('overdue_w'); },
    then: async ({ event, sb }) => {
      const { due_date, row } = reminderPayload(event);
      if (!event.company_id) return [];
      const { data: current } = await sb.from('site_checkins').select('checked_out_at').eq('id', s(row.id)).maybeSingle();
      if ((current as { checked_out_at?: string | null } | null)?.checked_out_at) return [];
      const [name, siteName] = await Promise.all([personName(sb, row.person_id), siteNameOf(sb, row.site_id, 'a site')]);
      return [notifyC({
        audiences: [cap(event.company_id, 'workforce.manage')], companyId: event.company_id, type: 'site_checkin_stale',
        title: `${name} checked in at ${siteName} on ${due_date} and has not checked out`,
        body: 'Check them out on the on-site roster once confirmed, or look into it if this is unexpected.',
        link: { portal: '/lead/workforce/onsite' },
      })];
    },
  },
];
