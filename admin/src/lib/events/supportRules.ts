import type { SupabaseClient } from '@supabase/supabase-js';
import { askJev } from '@/lib/jev/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { notify, type Audience } from '@/lib/notify/notify';
import {
  ENQUIRY_GATE, SR_DISSATISFACTION_GATE, SR_TRIAGE_GATE, enquiryIntentQuestions, enquiryIntentState,
  srTriageQuestions, srTriageState, toEnquiryTriage, toSrTriage,
} from '@/lib/support/jevQuestions';
import { SERVICE_REQUEST_TYPE_LABELS, labelFor } from '@/lib/ui/statusMaps';
import type { Consequence, Rule } from './rules';
import { changedTo, reminderPayload, rowPayload } from './types';

// Support & BD: what follows a service request, an SLA breach and a
// public enquiry.
//
// The only Jev outputs that reach a row are the `triage` JSONB columns
// (a recommendation the list renders as chips) and one staff nudge when
// dissatisfaction reads high. Status, urgency, the SLA and every email
// to a client come from the platform's own data — supportRules.test.ts
// drives an injected request through and asserts none of them moved.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const staffOnly: Audience[] = [{ kind: 'staff' }];
const owner = (companyId: string): Audience[] => [{ kind: 'account_owner', companyId }];
const PRIORITY_FROM_URGENCY: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = { low: 'low', normal: 'normal', high: 'high', urgent: 'urgent' };

type Sb = SupabaseClient;

/** Who owns this client's work: the account owner, else the first tps_admin. */
export async function staffOwnerFor(sb: Sb, companyId: string | null): Promise<string | null> {
  if (companyId) {
    const { data: co } = await sb.from('companies').select('account_owner_id').eq('id', companyId).maybeSingle();
    const id = (co as { account_owner_id?: string | null } | null)?.account_owner_id;
    if (id) return id;
  }
  const { data: staff } = await sb.from('profiles').select('id').eq('role', 'tps_admin').order('created_at').limit(1).maybeSingle();
  return (staff as { id: string } | null)?.id ?? null;
}

/** One internal task per source_ref (096 unique). Returns true when created now. */
export async function createKeyedInternalTask(sb: Sb, row: { company_id: string | null; assigned_to: string | null; title: string; description?: string | null; priority?: string; due_date?: string | null; source_ref: string }): Promise<boolean> {
  if (!row.assigned_to) return false;
  const { data, error } = await sb.from('internal_tasks').upsert({
    company_id: row.company_id, assigned_to: row.assigned_to, created_by: row.assigned_to,
    title: row.title.slice(0, 200), description: row.description ?? null, priority: row.priority ?? 'normal',
    status: 'todo', due_date: row.due_date ?? null, source_ref: row.source_ref,
  }, { onConflict: 'source_ref', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(`internal_tasks upsert: ${error.message}`);
  return (data ?? []).length > 0;
}

async function completeKeyedInternalTask(sb: Sb, sourceRef: string): Promise<void> {
  const res = await sb.from('internal_tasks').update({ status: 'done', completed_at: new Date().toISOString() }, COUNT_EXACT)
    .eq('source_ref', sourceRef).neq('status', 'done');
  judgeWrite({ error: res.error, count: res.count });   // zero matched is fine: no task, or already done
}

async function stampFirstResponse(sb: Sb, id: string): Promise<void> {
  const res = await sb.from('service_requests').update({ first_response_at: new Date().toISOString() }, COUNT_EXACT)
    .eq('id', id).is('first_response_at', null);
  judgeWrite({ error: res.error, count: res.count });
}

/** Jev reads the request and the result is written to `triage` only. */
export async function triageServiceRequest(sb: Sb, id: string, companyId: string | null): Promise<{ dissatisfied: boolean }> {
  const { data } = await sb.from('service_requests').select('id, company_id, request_type, urgency, subject, details, triage').eq('id', id).maybeSingle();
  const r = data as { id: string; company_id: string; request_type: string | null; urgency: string | null; subject: string | null; details: Record<string, unknown> | null; triage: unknown } | null;
  if (!r || r.triage) return { dissatisfied: false };
  const result = await askJev(sb, {
    kind: 'sr_triage', companyId: companyId ?? r.company_id, entityType: 'service_request', entityId: id,
    actor: { id: null, kind: 'system' }, state: srTriageState(r), questions: srTriageQuestions(), gate: SR_TRIAGE_GATE,
  });
  if (!result) return { dissatisfied: false };
  const selected: Record<string, string | number> = {};
  for (const [k, a] of Object.entries(result.answers)) selected[k] = a.type === 'noul' ? a.probability : a.selected;
  const triage = toSrTriage(selected, result.confidence, result.gated, result.decisionId, new Date());
  const res = await sb.from('service_requests').update({ triage }, COUNT_EXACT).eq('id', id);
  judgeWrite({ error: res.error, count: res.count });
  return { dissatisfied: !result.gated && (triage.dissatisfaction ?? 0) >= SR_DISSATISFACTION_GATE };
}

async function triageEnquiry(sb: Sb, id: string): Promise<void> {
  const { data } = await sb.from('enquiries').select('id, source, company_name, result, triage').eq('id', id).maybeSingle();
  const r = data as { id: string; source: string; company_name: string | null; result: Record<string, unknown> | null; triage: unknown } | null;
  if (!r || r.triage) return;
  const result = await askJev(sb, {
    kind: 'enquiry_intent', companyId: null, entityType: 'enquiry', entityId: id,
    actor: { id: null, kind: 'system' }, flags: null, state: enquiryIntentState(r), questions: enquiryIntentQuestions(), gate: ENQUIRY_GATE,
  });
  if (!result) return;
  const selected: Record<string, string | number> = {};
  for (const [k, a] of Object.entries(result.answers)) selected[k] = a.type === 'noul' ? a.probability : a.selected;
  const triage = toEnquiryTriage(selected, result.confidence, result.gated, result.decisionId, new Date());
  const res = await sb.from('enquiries').update({ triage }, COUNT_EXACT).eq('id', id);
  judgeWrite({ error: res.error, count: res.count });
}

const SOURCE_LABEL: Record<string, string> = { hiring_score: 'Smart Hiring Score', hr_risk: 'HR Risk Score', policy_healthcheck: 'Policy Healthcheck', due_diligence: 'DD Checklist', contact: 'Contact form' };

export const supportRules: Rule[] = [
  {
    // A raised request lands on the owner's task board with the SLA as
    // its due date, and Jev reads it for the chips.
    id: 'sr_task',
    on: 'service_requests.created',
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const id = s(event.entity_id);
      return [{
        kind: 'run', label: `service request task + triage ${id}`,
        fn: async (sb) => {
          const assignee = await staffOwnerFor(sb, event.company_id);
          await createKeyedInternalTask(sb, {
            company_id: event.company_id, assigned_to: assignee,
            title: `Service request: ${s(n.subject, 'untitled')}`,
            description: `${labelFor(SERVICE_REQUEST_TYPE_LABELS, s(n.request_type), s(n.request_type))}${n.urgency ? ` · ${s(n.urgency)} urgency` : ''}`,
            priority: PRIORITY_FROM_URGENCY[s(n.priority).toLowerCase()] ?? 'normal',
            due_date: n.sla_due_at ? s(n.sla_due_at).slice(0, 10) : null,
            source_ref: `sr:${id}`,
          });
          const { dissatisfied } = await triageServiceRequest(sb, id, event.company_id);
          if (dissatisfied && event.company_id) {
            const { data: co } = await sb.from('companies').select('name').eq('id', event.company_id).maybeSingle();
            await notify(sb, {
              audiences: staffOnly, companyId: event.company_id, type: 'client_at_risk', urgent: true,
              title: `${(co as { name?: string } | null)?.name ?? 'A client'} may be unhappy: ${s(n.subject, 'a service request')}`,
              body:  'Jev read dissatisfaction in this request. Worth a call before a written reply.',
              link:  { admin: '/requests' },
              dedupeKey: `client_at_risk:sr:${id}`,
            });
          }
        },
      }];
    },
  },
  {
    // Picked up: the raiser hears, and the first-response clock stops.
    id: 'sr_in_progress',
    on: 'service_requests.updated',
    when: e => changedTo(e, 'status', ['in_progress']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const id = s(event.entity_id);
      const out: Consequence[] = [{ kind: 'run', label: `first response ${id}`, fn: sb => stampFirstResponse(sb, id) }];
      if (n.submitted_by) out.push({
        kind: 'notify',
        input: {
          audiences: [{ kind: 'user', userId: s(n.submitted_by) }], companyId: event.company_id, type: 'service_request_updated',
          title: `We're working on: ${s(n.subject, 'your request')}`,
          body:  'Your request has been picked up. You will hear again when it is answered.',
          link:  { portal: '/support' },
        },
      });
      return out;
    },
  },
  {
    // Completed: the raiser hears in-app (the written response, when
    // there is one, was emailed by the respond route), and the owner's
    // task closes.
    id: 'sr_completed',
    on: 'service_requests.updated',
    when: e => changedTo(e, 'status', ['complete']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const id = s(event.entity_id);
      const out: Consequence[] = [{
        kind: 'run', label: `close task ${id}`,
        fn: async (sb) => { await completeKeyedInternalTask(sb, `sr:${id}`); await stampFirstResponse(sb, id); },
      }];
      if (n.submitted_by) out.push({
        kind: 'notify',
        input: {
          audiences: [{ kind: 'user', userId: s(n.submitted_by) }], companyId: event.company_id, type: 'service_request_completed',
          title: `Completed: ${s(n.subject, 'your request')}`,
          body:  n.responded_at ? 'The response is on your Support page.' : 'This request has been closed.',
          link:  { portal: '/support' },
        },
      });
      return out;
    },
  },
  {
    // The SLA passed with no first response: the owner is nudged, daily.
    id: 'sr_sla_breached',
    on: 'service_requests.reminder',
    when: e => reminderPayload(e).bucket === 'sla_breached',
    then: async ({ event, companyName }) => {
      const { row } = reminderPayload(event);
      if (!event.company_id) return [];
      return [{
        kind: 'notify',
        input: {
          audiences: owner(event.company_id), companyId: event.company_id, type: 'sla_breached', urgent: true,
          title: `Response overdue: ${s(row.subject, 'a service request')} (${await companyName() || 'a client'})`,
          body:  `${labelFor(SERVICE_REQUEST_TYPE_LABELS, s(row.request_type), s(row.request_type))}${row.urgency ? ` · ${s(row.urgency)} urgency` : ''} · due ${s(row.sla_due_at).slice(0, 16).replace('T', ' ')}`,
          link:  { admin: '/requests' },
        },
      }];
    },
  },
  {
    // A marketing-site form: staff hear at once; Jev reads the numbers.
    id: 'enquiry_received',
    on: 'enquiries.created',
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const id = s(event.entity_id);
      return [
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: null, type: 'enquiry_received', urgent: true,
            title: `New enquiry${n.company_name ? ` from ${s(n.company_name)}` : ''}: ${SOURCE_LABEL[s(n.source)] ?? s(n.source, 'website')}`,
            link:  { admin: '/enquiries' },
          },
        },
        { kind: 'run', label: `enquiry triage ${id}`, fn: sb => triageEnquiry(sb, id) },
      ];
    },
  },
];
