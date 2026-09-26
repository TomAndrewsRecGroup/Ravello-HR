import { askJev } from '@/lib/jev/client';
import { followupQuestions, followupState, type HsSeverity } from '@/lib/hs/jevQuestions';
import { HS_ACTIVITY_TYPE_LABELS, type HsActivityType } from '@/lib/hs/vocab';
import { hsCheckFailedEmail } from '@/lib/email/templates/hsCheckFailed';
import { portalUrl } from '@/lib/portalUrl';
import type { Audience } from '@/lib/notify/notify';
import { createKeyedInternalTask, staffOwnerFor } from './supportRules';
import type { Consequence, Rule } from './rules';
import { changedTo, rowPayload, type PlatformEvent } from './types';

// PROTECT / Health & Safety: what follows a staff record. Core OS 360
// staff deliver H&S directly (2026-09-25 — there is no external
// provider any more). A failed check becomes a client ACTION, the
// client and staff are told.
//
// The one Jev call here is a RECOMMENDATION: does a logged activity
// describe something the client still has to act on? Its state is the
// staff member's own typed text, so the answer only ever produces a
// "follow-up suggested" notification with a one-click Raise action
// for staff. hsRules.test.ts pins that no rule inserts an action from
// a Jev answer.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const staffOnly: Audience[] = [{ kind: 'staff' }];
const admins = (companyId: string): Audience[] => [{ kind: 'company_admins', companyId }];

export const HS_FAILED_CHECK_ACTION_TYPE = 'hs_failed_check';
export const HS_ACTIONS_RAISED_ACTION_TYPE = 'hs_actions_raised';
export const HS_AUDIT_FINDING_ACTION_TYPE = 'hs_audit_finding';
export const FOLLOWUP_GATE = 0.8;

async function itemTitle(ctx: { sb: { from: (t: string) => any } }, itemId: string): Promise<string> {
  const { data } = await ctx.sb.from('compliance_items').select('title').eq('id', itemId).maybeSingle();
  return (data as { title?: string } | null)?.title ?? 'Register item';
}

// On-site audit (110): one platform_event per audit (not per answer —
// a 20-question checklist would otherwise raise 20 events for one
// visit). The responses are read directly from the row the event
// points at, one query, here.
async function auditSubmittedConsequences(ctx: {
  sb: { from: (t: string) => any };
  event: PlatformEvent;
  companyName: () => Promise<string>;
}): Promise<Consequence[]> {
  const { event, sb, companyName } = ctx;
  if (!event.company_id || !event.entity_id) return [];
  const { new: n } = rowPayload(event);
  const { data } = await sb.from('hs_audit_responses')
    .select('id, prompt, comment')
    .eq('audit_id', event.entity_id)
    .eq('rating', 'fail');
  const findings = (data ?? []) as { id: string; prompt: string; comment: string | null }[];
  const title = s(n.title, 'Audit');
  const scoreText = n.score == null ? '' : ` — ${Math.round(Number(n.score))}%`;
  const findingText = findings.length === 1 ? '1 finding' : `${findings.length} findings`;
  const company = await companyName();

  const out: Consequence[] = findings.map(f => ({
    kind: 'action',
    companyId: event.company_id!,
    sourceRef: `hs_audit_response:${f.id}`,
    row: {
      action_type: HS_AUDIT_FINDING_ACTION_TYPE, priority: 'high',
      title: `Audit finding: ${f.prompt}`.slice(0, 200),
      description: f.comment,
      related_entity_type: 'hs_audit', related_entity_id: event.entity_id,
      created_by_admin: true,
    },
  }));
  out.push({
    kind: 'notify',
    input: {
      audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_audit_completed', urgent: findings.length > 0,
      title: `Audit completed: ${title}${scoreText}`,
      body:  findings.length > 0 ? `${findingText} — actions have been added to your PROTECT actions.` : 'No findings.',
      link:  { portal: findings.length > 0 ? '/protect/actions' : '/protect/timeline' },
    },
  });
  out.push({
    kind: 'notify',
    input: {
      audiences: staffOnly, companyId: event.company_id, type: 'hs_audit_completed',
      title: `${company || 'A client'}: audit completed — ${title}${scoreText}`,
      body:  findingText,
      link:  { admin: `/health-safety/${event.company_id}/audits` },
    },
  });
  return out;
}

export const hsRules: Rule[] = [
  {
    id: 'hs_check_failed',
    on: 'hs_register_completions.created',
    when: e => rowPayload(e).new.outcome === 'fail',
    then: async (ctx) => {
      const { event, companyName } = ctx;
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const title = await itemTitle(ctx, s(n.item_id));
      const company = await companyName();
      const out: Consequence[] = [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `hs_completion:${event.entity_id}`,
          row: {
            action_type: HS_FAILED_CHECK_ACTION_TYPE, priority: 'high',
            title: `Failed check: ${title}`,
            description: `Recorded as failed on ${s(n.completed_on)}. Arrange the remedial work and re-check; the register shows this item as in review until a pass is recorded.`,
            related_entity_type: 'compliance_item', related_entity_id: s(n.item_id) || null,
            created_by_admin: true,
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_check_failed', urgent: true,
            title: `Failed H&S check: ${title}`,
            body:  `Recorded ${s(n.completed_on)}. An action has been added to your PROTECT actions.`,
            link:  { portal: '/protect/actions' },
            emailHtml: (_r, href) => hsCheckFailedEmail({ companyName: company, itemTitle: title, completedOn: s(n.completed_on), actionsUrl: href ?? `${portalUrl()}/protect/actions` }),
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'hs_check_failed',
            title: `${company || 'A client'}: failed H&S check — ${title}`,
            link:  { admin: `/health-safety/${event.company_id}/register` },
          },
        },
      ];
      return out;
    },
  },
  {
    id: 'hs_actions_raised',
    on: 'hs_register_completions.created',
    when: e => rowPayload(e).new.outcome === 'pass_with_actions',
    then: async (ctx) => {
      const { event } = ctx;
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const title = await itemTitle(ctx, s(n.item_id));
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `hs_completion:${event.entity_id}`,
          row: {
            action_type: HS_ACTIONS_RAISED_ACTION_TYPE, priority: 'normal',
            title: `Actions from check: ${title}`,
            description: `The check on ${s(n.completed_on)} passed with actions raised. See the completion notes on your register.`,
            related_entity_type: 'compliance_item', related_entity_id: s(n.item_id) || null,
            created_by_admin: true,
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_actions_raised',
            title: `${title}: passed, with actions to complete`,
            link:  { portal: '/protect/actions' },
          },
        },
      ];
    },
  },
  {
    id: 'hs_activity_logged',
    on: 'hs_activities.created',
    then: async (ctx) => {
      const { event, sb } = ctx;
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const type = s(n.activity_type) as HsActivityType;
      const typeLabel = HS_ACTIVITY_TYPE_LABELS[type] ?? type;
      const out: Consequence[] = [{
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_activity_logged',
          title: `Core OS 360 · ${typeLabel} · ${s(n.occurred_on)}`,
          body:  s(n.title),
          link:  { portal: '/protect/timeline' },
        },
      }];

      // Jev: does this need following up? The summary is the staff
      // member's own typed text, so the answer is a suggestion to
      // STAFF with a one-click Raise action — never an action created
      // here.
      const { data: full } = await sb.from('hs_activities').select('activity_type, title, summary').eq('id', s(event.entity_id)).maybeSingle();
      if (full) {
        const r = await askJev(sb, {
          kind: 'hs_activity_followup', companyId: event.company_id, entityType: 'hs_activity', entityId: event.entity_id,
          actor: { id: null, kind: 'system' }, state: followupState(full as { activity_type: string; title: string; summary: string | null }), questions: followupQuestions(),
          gate: FOLLOWUP_GATE,
        });
        const p = r?.answers.needs_followup?.type === 'noul' ? r.answers.needs_followup.probability : 0;
        const severity = (r?.answers.severity?.type === 'choice' ? r.answers.severity.selected : 'none') as HsSeverity;
        if (r && p >= FOLLOWUP_GATE && severity !== 'none') {
          out.push({
            kind: 'notify',
            input: {
              audiences: staffOnly, companyId: event.company_id, type: 'hs_followup_suggested', urgent: severity === 'serious',
              title: `Follow-up suggested (${severity}): ${s(n.title)}`,
              body:  `The ${typeLabel.toLowerCase()} on ${s(n.occurred_on)} looks like it leaves the client something to act on (${Math.round(p * 100)}%). Review and raise an action if so.`,
              link:  { admin: `/health-safety/${event.company_id}/activities` },
            },
          });
        }
      }
      return out;
    },
  },
  {
    // A staff upload is new to the client the moment it lands.
    id: 'hs_evidence_added',
    on: 'hs_files.created',
    when: e => e.actor_kind !== 'client',
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      return [{
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_evidence_added',
          title: `Evidence added to your H&S record: ${s(n.file_name)}`,
          link:  { portal: '/protect/compliance' },
        },
      }];
    },
  },
  {
    // A new register item is worth telling the client about; staff
    // added it themselves so they don't need telling too.
    id: 'hs_item_added',
    on: 'compliance_items.created',
    when: e => e.actor_kind !== 'client' && rowPayload(e).new.domain === 'hs',
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      return [{
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_item_added',
          title: `Added to your H&S register: ${s(n.title)}`,
          body:  n.due_date ? `First due ${s(n.due_date)}` : null,
          link:  { portal: '/protect/compliance' },
        },
      }];
    },
  },
  {
    id: 'hs_action_done',
    on: 'actions.updated',
    when: e => changedTo(e, 'status', ['complete']) && /^hs_completion:/.test(s(rowPayload(e).new.source_ref)),
    then: async (ctx) => {
      const { event, companyName } = ctx;
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      return [{
        kind: 'notify',
        input: {
          audiences: staffOnly, companyId: event.company_id, type: 'hs_action_done',
          title: `${await companyName() || 'The client'} completed: ${s(n.title)}`,
          link:  { admin: `/health-safety/${event.company_id}/register` },
        },
      }];
    },
  },
  {
    // hs_audits is INSERT-only (110) — every row is already a finished
    // submission, so `created` is the only event this ever needs.
    id: 'hs_audit_completed',
    on: 'hs_audits.created',
    then: auditSubmittedConsequences,
  },
  {
    // Incidents (112) are the client's own legal RIDDOR record-keeping
    // duty — Core OS 360 records it on their behalf, so unlike a failed
    // check (which raises a CLIENT action) a RIDDOR-reportable incident
    // raises a STAFF task: reporting to the HSE is Core OS 360's job,
    // not something to hand the client. No specific day-count deadline
    // is asserted here — RIDDOR's reporting window varies by category,
    // and a wrong number would be worse than "without delay."
    id: 'hs_incident_reported',
    on: 'hs_incidents.created',
    then: async (ctx) => {
      const { event, companyName } = ctx;
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const typeLabel = s(n.incident_type).replace(/_/g, ' ');
      const company = await companyName();
      const riddor = n.riddor_reportable === true;
      const out: Consequence[] = [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_incident_reported',
            title: `Incident recorded: ${typeLabel}`,
            body:  s(n.description).slice(0, 200),
            link:  { portal: '/protect/incidents' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'hs_incident_reported', urgent: riddor,
            title: `${company || 'A client'}: ${typeLabel} incident recorded${riddor ? ' — RIDDOR reportable' : ''}`,
            link:  { admin: `/health-safety/${event.company_id}/incidents` },
          },
        },
      ];
      if (riddor) {
        out.push({
          kind: 'run', label: `riddor report task ${event.entity_id}`,
          fn: async (sb) => {
            const owner = await staffOwnerFor(sb, event.company_id);
            await createKeyedInternalTask(sb, {
              company_id: event.company_id, assigned_to: owner, priority: 'urgent',
              title: `RIDDOR: report incident to the HSE — ${company || 'client'}`,
              description: `A ${typeLabel} incident on ${s(n.occurred_on)} is RIDDOR reportable. Report it via RIDDOR online without delay, then record the report date on the incident.`,
              source_ref: `hs_incident_riddor:${event.entity_id}`,
            });
          },
        });
      }
      return out;
    },
  },
  {
    // The creation rule above only ever fires once, at report time — a
    // closed investigation (status open -> investigating -> closed,
    // written directly from IncidentsClient.tsx) previously reached
    // nobody. The client would otherwise only learn an investigation
    // had concluded by re-checking their read-only Incidents tab.
    id: 'hs_incident_status_changed',
    on: 'hs_incidents.updated',
    when: e => changedTo(e, 'status', ['closed']),
    then: async (ctx) => {
      const { event } = ctx;
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const typeLabel = s(n.incident_type).replace(/_/g, ' ');
      return [{
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_incident_status_changed',
          title: `Investigation closed: ${typeLabel} incident`,
          link:  { portal: '/protect/incidents' },
        },
      }];
    },
  },
  {
    // Every hs_documents row is a finished, already-current version —
    // a replacement is a NEW row (the old one flips to 'superseded' via
    // its own .updated, which needs no separate notification since this
    // .created already covers it). Only staff write this table (client
    // RLS is read-only), so unlike documents.created (leadRules.ts) there
    // is no client-vs-staff actor branch to make.
    id: 'hs_document_added',
    on: 'hs_documents.created',
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id || n.status !== 'active') return [];
      return [{
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_document_added',
          title: `New H&S document from Core OS 360: ${s(n.title, 'a document')}`,
          link:  { portal: '/protect/documents' },
        },
      }];
    },
  },
  {
    // A built_in test self-marks and completes the instant the employee
    // submits (116's own trigger) — with no row-level trigger on
    // hs_test_submissions (deliberately: see 116's header comment), the
    // public token route emits this itself, the same shape as the
    // manatal move-stage fix (X1 site 2) uses for a route with no local
    // row of its own to trigger from. Same notification type and link
    // the admin "log a result" route already uses, so the two paths
    // never disagree about what the client sees.
    id: 'hs_test_submission_recorded',
    on: 'hs_test_submission.created',
    then: ({ event }) => {
      const p = event.payload;
      if (!event.company_id) return [];
      return [{
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_test_result',
          title: `${s(p.employee_name, 'An employee')}: ${s(p.test_title, 'test')} — ${p.passed ? 'Passed' : 'Failed'}`,
          link:  { portal: '/protect/tests' },
        },
      }];
    },
  },
];

export type { PlatformEvent };
