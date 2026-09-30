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
export const EMERGENCY_DRILL_FINDING_ACTION_TYPE = 'hs_emergency_drill_finding';
export const FOLLOWUP_GATE = 0.8;

async function assetName(sb: { from: (t: string) => any }, assetId: string): Promise<string> {
  const { data } = await sb.from('hs_equipment').select('name').eq('id', assetId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? 'an asset';
}

async function planTitle(sb: { from: (t: string) => any }, planId: string): Promise<string> {
  const { data } = await sb.from('emergency_plans').select('title').eq('id', planId).maybeSingle();
  return (data as { title?: string } | null)?.title ?? 'Emergency plan';
}


async function itemTitle(ctx: { sb: { from: (t: string) => any } }, itemId: string): Promise<string> {
  const { data } = await ctx.sb.from('compliance_items').select('title').eq('id', itemId).maybeSingle();
  return (data as { title?: string } | null)?.title ?? 'Register item';
}

// audit_findings.severity ('minor'|'major'|'critical') -> the
// corrective action's own actions.priority/actions.severity vocabulary
// (a different, existing CHECK: low/medium/high/critical for severity,
// low/normal/high/urgent for priority) — never the same tuple reused
// under a different name.
const FINDING_PRIORITY: Record<string, 'normal' | 'high' | 'urgent'> = { minor: 'normal', major: 'high', critical: 'urgent' };
const FINDING_ACTION_SEVERITY: Record<string, 'low' | 'medium' | 'high' | 'critical'> = { minor: 'low', major: 'medium', critical: 'critical' };

// On-site audit (110): one platform_event per audit (not per answer —
// a 20-question checklist would otherwise raise 20 events for one
// visit). The responses are read directly from the row the event
// points at, one query, here. Core-OS 360 Phase 5, Group 7 (162):
// every failed response now also has an audit_findings row (created
// synchronously inside hs_submit_audit, never here) — read its
// severity to set the corrective action's own priority/severity/
// verification_required, and link the action back onto the finding
// once created, so audit_findings.corrective_action_id is never left
// null for a finding that already has its own raised action.
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
  let fdata: { hs_audit_response_id: string; severity: string }[] = [];
  if (findings.length > 0) {
    const res = await sb.from('audit_findings').select('hs_audit_response_id, severity').eq('audit_id', event.entity_id);
    fdata = (res.data ?? []) as { hs_audit_response_id: string; severity: string }[];
  }
  const severityByResponse = new Map<string, string>(fdata.map(r => [r.hs_audit_response_id, r.severity]));
  const title = s(n.title, 'Audit');
  const scoreText = n.score == null ? '' : ` — ${Math.round(Number(n.score))}%`;
  const findingText = findings.length === 1 ? '1 finding' : `${findings.length} findings`;
  const company = await companyName();
  const hasMajorOrCritical = findings.some(f => ['major', 'critical'].includes(severityByResponse.get(f.id) ?? 'minor'));

  const out: Consequence[] = findings.map(f => {
    const severity = severityByResponse.get(f.id) ?? 'minor';
    const sourceRef = `hs_audit_response:${f.id}`;
    return {
      kind: 'action',
      companyId: event.company_id!,
      sourceRef,
      row: {
        action_type: HS_AUDIT_FINDING_ACTION_TYPE, priority: FINDING_PRIORITY[severity] ?? 'high',
        title: `Audit finding: ${f.prompt}`.slice(0, 200),
        description: f.comment,
        related_entity_type: 'hs_audit', related_entity_id: event.entity_id,
        created_by_admin: true,
        severity: FINDING_ACTION_SEVERITY[severity] ?? 'high',
        source_type: 'audit_finding', source_id: f.id,
        verification_required: severity === 'major' || severity === 'critical',
      },
    };
  });
  // Link each finding's corrective_action_id to the action just raised
  // for it — only when still unset, so a later human change is never
  // clobbered by a re-processed event.
  if (findings.length > 0) {
    out.push({
      kind: 'run',
      label: 'link audit findings to their raised actions',
      fn: async (rsb) => {
        for (const f of findings) {
          const { data: act } = await rsb.from('actions').select('id')
            .eq('company_id', event.company_id!).eq('source_ref', `hs_audit_response:${f.id}`).maybeSingle();
          const actionId = (act as { id?: string } | null)?.id;
          if (!actionId) continue;
          // { count: 'exact' } so a 0 (already linked by a later human
          // edit, or the row no longer exists) is distinguishable from
          // an actual write — check-blind-updates.sh's own ratchet.
          await rsb.from('audit_findings').update({ corrective_action_id: actionId }, { count: 'exact' })
            .eq('hs_audit_response_id', f.id).is('corrective_action_id', null);
        }
      },
    });
  }
  out.push({
    kind: 'notify',
    input: {
      audiences: admins(event.company_id), companyId: event.company_id, type: 'hs_audit_completed', urgent: hasMajorOrCritical,
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
    // Core-OS 360 Phase 5, Group 7 (162): a finding closing (the
    // database's own audit_findings_closure_guard() already refused
    // this unless a major/critical finding had a root cause, a linked
    // corrective action, AND that action's own verified/effective
    // state — this rule only reports what already happened).
    id: 'audit_finding_closed',
    on: 'audit_findings.updated',
    when: e => changedTo(e, 'closed_at') && rowPayload(e).new.closed_at != null,
    then: async ({ event }) => {
      if (!event.company_id) return [];
      return [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'audit_finding_closed',
            title: 'An audit finding has been closed out',
            link:  { portal: '/protect/audits' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'audit_finding_closed',
            title: 'An audit finding has been closed out',
            link:  { admin: `/health-safety/${event.company_id}/audits` },
          },
        },
      ];
    },
  },
  {
    // inspections is INSERT-only (145, Phase 4 Group 3) — every row is
    // already a finished submission. Phase 4 Group 4 extends this rule:
    // every FAILED response raises one keyed defect action (the same
    // "one action per finding" shape auditSubmittedConsequences already
    // uses) — never a second table (this file's own standing rule).
    // A CRITICAL item's action gets severity='critical' and
    // verification_required=true, which is what the database's own
    // return-to-service guard (146) reads to decide whether the asset
    // may leave 'quarantined' — the asset's own status is set
    // server-side at submission time (hs_submit_inspection/
    // hs_quarantine_asset, 146), never from here: this rule only
    // reports what already happened, it never decides it.
    id: 'inspection_completed',
    on: 'inspections.created',
    then: async ({ event, sb, companyName }) => {
      if (!event.company_id || !event.entity_id) return [];
      const { new: n } = rowPayload(event);
      const failed = n.overall_outcome === 'fail';
      const asset = await assetName(sb, s(n.asset_id));
      const company = await companyName();
      const out: Consequence[] = [];

      if (failed) {
        const { data } = await sb.from('inspection_responses')
          .select('id, prompt, comment, critical')
          .eq('inspection_id', event.entity_id)
          .eq('rating', 'fail');
        const findings = (data ?? []) as { id: string; prompt: string; comment: string | null; critical: boolean }[];
        for (const f of findings) {
          out.push({
            kind: 'action',
            companyId: event.company_id,
            sourceRef: `inspection_response:${f.id}`,
            row: {
              action_type: 'hs_inspection_defect',
              priority: f.critical ? 'urgent' : 'normal',
              severity: f.critical ? 'critical' : 'low',
              verification_required: f.critical,
              title: `Defect: ${f.prompt}`.slice(0, 200),
              description: f.comment,
              source_type: 'inspection', source_id: f.id,
              related_entity_type: 'hs_equipment', related_entity_id: s(n.asset_id),
              created_by_admin: true,
            },
          });
        }
      }

      out.push({
        kind: 'notify',
        input: {
          audiences: admins(event.company_id), companyId: event.company_id, type: 'inspection_completed', urgent: failed,
          title: failed ? `Inspection failed: ${asset}` : `Inspection completed: ${asset}`,
          body:  failed
            ? n.has_critical_failure
              ? 'A critical item failed. This asset has been quarantined and needs attention before further use.'
              : 'One or more items failed. A defect has been added to your PROTECT actions.'
            : 'All items passed.',
          link:  { portal: failed ? '/protect/actions' : '/protect/timeline' },
        },
      });
      if (failed) {
        out.push({
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'inspection_completed',
            title: `${company || 'A client'}: inspection failed — ${asset}`,
            body:  n.has_critical_failure ? 'Critical item failed — asset quarantined.' : 'Non-critical failure(s).',
            link:  { admin: `/health-safety/${event.company_id}` },
          },
        });
      }
      return out;
    },
  },
  {
    // Core-OS 360 Phase 4 (148): a PUWER assessment recorded a
    // non-compliant or compliant-with-actions outcome — found by the
    // Group 12 wiring sweep as a table with a trigger but no consuming
    // rule (the only consequence was a reminder on the review cycle).
    // Neutral wording throughout: this reports a RECORDED ASSESSMENT
    // OUTCOME, never a legal compliance judgement (Phase 4's own
    // standing rule) — the same discipline PUWER_ASSESSMENT_OUTCOME_LABELS
    // already applies. Exactly ONE action per assessment, the same
    // `hs_check_failed` shape.
    id: 'puwer_non_compliant',
    on: 'puwer_assessments.created',
    when: e => rowPayload(e).new.outcome !== 'compliant',
    then: async ({ event, sb, companyName }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const asset = await assetName(sb, s(n.asset_id));
      const company = await companyName();
      const nonCompliant = n.outcome === 'non_compliant';
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `puwer_assessment:${event.entity_id}`,
          row: {
            action_type: 'hs_puwer_finding', priority: nonCompliant ? 'high' : 'normal',
            title: `PUWER assessment: ${asset}`,
            description: `Recorded assessment outcome on ${s(n.assessed_on)}: ${nonCompliant ? 'non-compliant' : 'compliant, with actions'}. Review and address before the next assessment.`,
            related_entity_type: 'hs_equipment', related_entity_id: s(n.asset_id) || null,
            created_by_admin: true,
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'puwer_assessment_recorded',
            title: `PUWER assessment recorded: ${asset}`,
            body:  `Recorded ${s(n.assessed_on)} as ${nonCompliant ? 'non-compliant' : 'compliant, with actions'}. An action has been added to your PROTECT actions.`,
            link:  { portal: '/protect/actions' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'puwer_assessment_recorded',
            title: `${company || 'A client'}: PUWER assessment recorded — ${asset}`,
            link:  { admin: `/health-safety/${event.company_id}/equipment` },
          },
        },
      ];
    },
  },
  {
    // Core-OS 360 Phase 4 (149): a LOLER thorough examination recorded
    // 'immediate danger' (LOLER reg 8). The asset is ALREADY quarantined
    // — synchronously, inside hs_equipment_inspection_roll(), before
    // this event is even processed. This rule only reports what already
    // happened and raises the follow-up defect action; it never decides
    // anything and never reports to the HSE — the exact "flag, never
    // decide" posture Phase 2's RIDDOR review already established for a
    // different regulator.
    id: 'loler_immediate_danger',
    on: 'hs_equipment_inspections.created',
    when: e => rowPayload(e).new.immediate_danger === true,
    then: async ({ event, sb, companyName }) => {
      if (!event.company_id || !event.entity_id) return [];
      const { new: n } = rowPayload(event);
      const asset = await assetName(sb, s(n.equipment_id));
      const company = await companyName();
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `hs_equipment_inspection:${event.entity_id}`,
          row: {
            action_type: 'hs_immediate_danger', priority: 'urgent', severity: 'critical', verification_required: true,
            title: `Immediate danger recorded: ${asset}`.slice(0, 200),
            source_type: 'equipment_inspection', source_id: String(event.entity_id),
            related_entity_type: 'hs_equipment', related_entity_id: s(n.equipment_id),
            created_by_admin: true,
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'loler_immediate_danger', urgent: true,
            title: `Immediate danger recorded: ${asset}`,
            body:  'A thorough examination recorded an immediate danger. This asset has been quarantined and must not be used until the defect is resolved and verified.',
            link:  { portal: '/protect/actions' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'loler_immediate_danger',
            title: `${company || 'A client'}: immediate danger recorded — ${asset}`,
            body:  'Asset quarantined. Review and follow up as required.',
            link:  { admin: `/health-safety/${event.company_id}` },
          },
        },
      ];
    },
  },
  {
    // Core-OS 360 Phase 4 (150): a contractor's approval status
    // changed. Only 'suspended'/'rejected' are worth a nudge — an
    // approval or a return to pending is informational and not raised
    // here.
    // Widened to also tell the client's own admins (Completion
    // Programme Phase 22, Group 2/6) now that /protect/contractors
    // exists — the exact "widen once that page exists" this rule's
    // own comment already called for.
    id: 'contractor_status_changed',
    on: 'contractors.updated',
    when: e => changedTo(e, 'approval_status', ['suspended', 'rejected']),
    then: async ({ event, companyName }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const name = s(n.name, 'A contractor');
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'contractor_status_changed',
            title: `${name} is now ${s(n.approval_status).replace('_', ' ')}`,
            link:  { portal: '/protect/contractors' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'contractor_status_changed',
            title: `${company || 'A client'}: ${name} is now ${s(n.approval_status).replace('_', ' ')}`,
            link:  { admin: `/health-safety/${event.company_id}/contractors` },
          },
        },
      ];
    },
  },
  // Incident rules moved to safetyRules.ts (125): severity is
  // confirmed by a person later, RIDDOR is decided on the RIDDOR review,
  // and the outbox no longer carries the description at all.
  {
    // Core-OS 360 Phase 4 (152): a permit to work's status changed.
    // Only the statuses that need a human's attention are worth a
    // nudge — issue/revalidation and closure are the normal, expected
    // path and are not raised here. Widened to also tell the client's
    // own admins (Completion Programme Phase 22, Group 2/6) now that
    // /protect/permits exists.
    id: 'permit_status_changed',
    on: 'permits.updated',
    when: e => changedTo(e, 'status', ['suspended', 'revoked']),
    then: async ({ event, companyName }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'permit_status_changed',
            title: `Permit ${s(n.permit_number, '')} is now ${s(n.status)}`,
            link:  { portal: '/protect/permits' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'permit_status_changed',
            title: `${company || 'A client'}: permit ${s(n.permit_number, '')} is now ${s(n.status)}`,
            link:  { admin: `/health-safety/${event.company_id}/permits` },
          },
        },
      ];
    },
  },
  {
    // Core-OS 360 Phase 4 (153): an isolation applied, taking an asset
    // out of service. Only the CREATE is raised here (removal is the
    // normal, expected end of the story and not worth a separate
    // nudge — the register/equipment page already shows the asset back
    // in service). Widened to also tell the client's own admins
    // (Completion Programme Phase 22, Group 2/6) now that
    // /protect/isolations exists.
    id: 'isolation_applied',
    on: 'isolations.created',
    then: async ({ event, sb, companyName }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const asset = await assetName(sb, s(n.asset_id));
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'isolation_applied',
            title: `${asset} is out of service (isolation applied)`,
            link:  { portal: '/protect/isolations' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'isolation_applied',
            title: `${company || 'A client'}: ${asset} is out of service (isolation applied)`,
            link:  { admin: `/health-safety/${event.company_id}/isolations` },
          },
        },
      ];
    },
  },
  {
    // Core-OS 360 Phase 4 (154): a new emergency plan added — found by
    // the Group 12 wiring sweep as a table with a trigger but no
    // consuming rule (only a review-cycle reminder existed). A
    // supersede (a new version replacing an old one) raises nothing
    // separately: the new version's own .created already covers it,
    // the same reasoning hs_document_added (106) already established
    // for the identical versioning shape. STAFF-ONLY for now, the same
    // reasoning as every other Phase 4 site-safety table with no
    // portal page yet (Group 13 builds it).
    id: 'emergency_plan_added',
    on: 'emergency_plans.created',
    then: async ({ event, companyName }) => {
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'emergency_plan_added',
            title: `${company || 'A client'}: new emergency plan — ${s(n.title, 'Untitled plan')}`,
            link:  { admin: `/health-safety/${event.company_id}` },
          },
        },
      ];
    },
  },
  {
    // Core-OS 360 Phase 4 (154): a drill recorded against an emergency
    // plan. DRILL FINDINGS ARE NEVER A SECOND TABLE — an outcome of
    // 'issues_found'/'failed' raises exactly ONE row on the existing
    // `actions` table (the same shape hs_check_failed already uses),
    // never one per individual finding: the register's own
    // "one platform_event per visit, not per answer" discipline (110).
    // A 'successful' drill raises nothing — that is the normal,
    // expected outcome, not something to nudge anyone about.
    id: 'emergency_drill_recorded',
    on: 'emergency_drills.created',
    when: e => rowPayload(e).new.outcome !== 'successful',
    then: async (ctx) => {
      const { event, sb, companyName } = ctx;
      if (!event.company_id) return [];
      const { new: n } = rowPayload(event);
      const plan = await planTitle(sb, s(n.plan_id));
      const company = await companyName();
      const failed = n.outcome === 'failed';
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `emergency_drill:${event.entity_id}`,
          row: {
            action_type: EMERGENCY_DRILL_FINDING_ACTION_TYPE, priority: failed ? 'high' : 'normal',
            title: `Drill finding: ${plan}`,
            description: `${failed ? 'Failed' : 'Issues found'} on ${s(n.drill_date)}. Review and address before the next drill.`,
            related_entity_type: 'emergency_plan', related_entity_id: s(n.plan_id) || null,
            created_by_admin: true,
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'emergency_drill_recorded',
            title: `${failed ? 'Failed' : 'Issues found in'} drill: ${plan}`,
            body:  `Recorded ${s(n.drill_date)}. An action has been added to your PROTECT actions.`,
            link:  { portal: '/protect/actions' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'emergency_drill_recorded',
            title: `${company || 'A client'}: drill ${n.outcome === 'failed' ? 'failed' : 'found issues'} — ${plan}`,
            link:  { admin: `/health-safety/${event.company_id}` },
          },
        },
      ];
    },
  },
  {
    // Core-OS 360 Phase 5, Group 5 (160): every hs_documents INSERT is
    // now always a draft (hs_document_lifecycle_guard's own rule 2), so
    // "a new document reached the client" is a transition TO 'active'
    // (published), never the insert itself — replacing the pre-160
    // insert-with-status-active check, which is now unreachable.
    id: 'hs_document_added',
    on: 'hs_documents.updated',
    when: e => changedTo(e, 'status', ['active']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
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
    // A named reviewer is told directly ({ kind: 'user' }) — staff also
    // hear, since this is still an internal step (the client never sees
    // a document before it is published).
    id: 'hs_document_submitted_for_review',
    on: 'hs_documents.updated',
    when: e => changedTo(e, 'status', ['pending_review']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const reviewerId = s(n.reviewer_id);
      if (!reviewerId) return [];
      return [{
        kind: 'notify',
        input: {
          audiences: [{ kind: 'user', userId: reviewerId }, ...staffOnly], companyId: event.company_id, type: 'hs_document_submitted_for_review',
          title: `Ready for your review: ${s(n.title, 'a document')}`,
          link:  { admin: event.company_id ? `/health-safety/${event.company_id}/documents` : '/health-safety' },
        },
      }];
    },
  },
  {
    id: 'hs_document_submitted_for_approval',
    on: 'hs_documents.updated',
    when: e => changedTo(e, 'status', ['pending_approval']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const approverId = s(n.approver_id);
      if (!approverId) return [];
      return [{
        kind: 'notify',
        input: {
          audiences: [{ kind: 'user', userId: approverId }, ...staffOnly], companyId: event.company_id, type: 'hs_document_submitted_for_approval',
          title: `Ready for your approval: ${s(n.title, 'a document')}`,
          link:  { admin: event.company_id ? `/health-safety/${event.company_id}/documents` : '/health-safety' },
        },
      }];
    },
  },
  {
    // Staff-only: approval is not yet publication (that is
    // hs_document_added, above, on the LATER active transition).
    id: 'hs_document_approved',
    on: 'hs_documents.updated',
    when: e => changedTo(e, 'status', ['approved']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      return [{
        kind: 'notify',
        input: {
          audiences: staffOnly, companyId: event.company_id, type: 'hs_document_approved',
          title: `Approved: ${s(n.title, 'a document')} — publish when ready`,
          link:  { admin: event.company_id ? `/health-safety/${event.company_id}/documents` : '/health-safety' },
        },
      }];
    },
  },
  {
    // A document withdrawn while already published tells the client
    // too (it may have been in their hands); one still in internal
    // review/approval is staff-only, since the client never saw it.
    id: 'hs_document_withdrawn',
    on: 'hs_documents.updated',
    when: e => changedTo(e, 'status', ['withdrawn']),
    then: ({ event }) => {
      const { new: n, old: o } = rowPayload(event);
      const wasPublished = ['active', 'review_due'].includes(s(o.status));
      const audiences: Audience[] = wasPublished && event.company_id ? [...admins(event.company_id), ...staffOnly] : staffOnly;
      return [{
        kind: 'notify',
        input: {
          audiences, companyId: event.company_id, type: 'hs_document_withdrawn',
          title: `Withdrawn: ${s(n.title, 'a document')}`,
          link:  wasPublished ? { portal: '/protect/documents' } : undefined,
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
