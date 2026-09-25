import { askJev } from '@/lib/jev/client';
import { followupQuestions, followupState, type HsSeverity } from '@/lib/hs/jevQuestions';
import { HS_ACTIVITY_TYPE_LABELS, type HsActivityType } from '@/lib/hs/vocab';
import { hsCheckFailedEmail } from '@/lib/email/templates/hsCheckFailed';
import { portalUrl } from '@/lib/portalUrl';
import type { Audience } from '@/lib/notify/notify';
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
export const FOLLOWUP_GATE = 0.8;

async function itemTitle(ctx: { sb: { from: (t: string) => any } }, itemId: string): Promise<string> {
  const { data } = await ctx.sb.from('compliance_items').select('title').eq('id', itemId).maybeSingle();
  return (data as { title?: string } | null)?.title ?? 'Register item';
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
];

export type { PlatformEvent };
