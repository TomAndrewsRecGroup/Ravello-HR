import type { Audience } from '@/lib/notify/notify';
import { HS_INCIDENT_SEVERITY_LABELS, HS_INCIDENT_TYPE_LABELS, HS_VERIFY_SEVERITIES, type HsIncidentSeverity, type HsIncidentType } from '@/lib/hs/vocab';
import {
  DOC_STATUS_LABELS, docPath, hazardPath, incidentPath, PROTECT_PATHS,
  type DocKind, type DocStatus,
} from '@/lib/hs/safetyVocab';
import { SAFETY_ACTION_SOURCES } from '@/lib/reminders/rules';
import { createKeyedInternalTask, staffOwnerFor } from './supportRules';
import type { Consequence, NotifyConsequence, Rule, RuleContext } from './rules';
import { changedTo, isOverdueWeekly, reminderPayload, rowPayload, type PlatformEvent } from './types';

// PROTECT — the operational safety core (Phase 2, 123-126): who hears
// about what. Every audience is a CAPABILITY or a named person on the
// record (owner, assessor, lead investigator, verifier, assignee),
// resolved inside the organisation — home members by role, consultants
// by live grant — never "all admins" by default.
//
// Every title is built from the record's own reference/number and a
// vocabulary label. NEVER a description, a title a reporter typed on
// an incident, a person's name, or anything else that can carry medical
// or personal detail: the outbox whitelists (125) do not even carry
// those columns, and safetyRules.test.ts pins that no rule reads them.
//
// Nothing here decides anything. RIDDOR is a prompt to a person with
// riddor.review; the report to the HSE is a task for a human.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const staff: Audience = { kind: 'staff' };
const cap = (companyId: string, capability: string): Audience => ({ kind: 'capability', companyId, capability });
const user = (id: unknown): Audience[] => (id ? [{ kind: 'user', userId: String(id) }] : []);
/** A named person on a record may be staff (they sign in to admin), so
 *  every notification here also carries the client's H&S workspace link. */
const notifyC = (input: NotifyConsequence['input']): NotifyConsequence => ({
  kind: 'notify',
  input: {
    ...input,
    link: { admin: input.companyId ? `/health-safety/${input.companyId}` : '/health-safety', ...input.link },
  },
});
/** A reminder must reach SOMEONE: the named people, else the capability. */
const orElse = (named: Audience[], fallback: Audience): Audience[] => (named.length ? named : [fallback]);

/** The named people on a record, minus whoever just acted. */
function people(event: PlatformEvent, row: Record<string, unknown>, cols: string[]): Audience[] {
  const ids = new Set<string>();
  for (const c of cols) if (row[c] && row[c] !== event.actor_id) ids.add(String(row[c]));
  return [...ids].map(id => ({ kind: 'user', userId: id }));
}

const DOC_KINDS: { entity: 'risk_assessments' | 'method_statements' | 'coshh_assessments'; kind: DocKind; noun: string; authors: string[] }[] = [
  { entity: 'risk_assessments',  kind: 'risk_assessment',  noun: 'Risk assessment', authors: ['assessor_id', 'responsible_manager_id'] },
  { entity: 'method_statements', kind: 'method_statement', noun: 'RAMS',            authors: ['author_id', 'responsible_manager_id'] },
  { entity: 'coshh_assessments', kind: 'coshh_assessment', noun: 'COSHH assessment', authors: ['assessor_id', 'responsible_manager_id'] },
];

const docLabel = (noun: string, n: Record<string, unknown>) =>
  `${noun} ${s(n.reference)}${n.version != null ? ` v${s(n.version)}` : ''}`;

function docRules(): Rule[] {
  return DOC_KINDS.flatMap(({ entity, kind, noun, authors }): Rule[] => [
    {
      id: `${kind}_submitted`,
      on: `${entity}.updated`,
      when: e => changedTo(e, 'status', ['pending_review']),
      then: ({ event }) => {
        const { new: n } = rowPayload(event);
        if (!event.company_id) return [];
        return [notifyC({
          audiences: [cap(event.company_id, 'risk.approve')], companyId: event.company_id, type: 'safety_doc_review_requested',
          title: `${docLabel(noun, n)} is ready for review`,
          link: { portal: docPath(kind, event.entity_id) },
        })];
      },
    },
    {
      id: `${kind}_decided`,
      on: `${entity}.updated`,
      when: e => changedTo(e, 'status', ['changes_requested', 'approved']),
      then: ({ event }) => {
        const { new: n } = rowPayload(event);
        if (!event.company_id) return [];
        const aud = people(event, n, authors);
        if (!aud.length) return [];
        return [notifyC({
          audiences: aud, companyId: event.company_id, type: 'safety_doc_decided',
          title: `${docLabel(noun, n)}: ${DOC_STATUS_LABELS[n.status as DocStatus] ?? s(n.status)}`,
          link: { portal: docPath(kind, event.entity_id) },
        })];
      },
    },
    {
      // SDS change, incident, near miss or a scheduled date: the review
      // is a person's job. The reason travels as a vocabulary value.
      id: `${kind}_review_due`,
      on: `${entity}.updated`,
      when: e => changedTo(e, 'status', ['review_due']),
      then: ({ event }) => {
        const { new: n } = rowPayload(event);
        if (!event.company_id) return [];
        return [notifyC({
          audiences: [...people(event, n, authors), cap(event.company_id, 'risk.approve')], companyId: event.company_id,
          type: 'safety_doc_review_due',
          title: `${docLabel(noun, n)} needs review${n.review_reason ? ` (${s(n.review_reason).replace(/_/g, ' ')})` : ''}`,
          link: { portal: docPath(kind, event.entity_id) },
        })];
      },
    },
    {
      id: `${kind}_reminder`,
      on: `${entity}.reminder`,
      then: ({ event }) => {
        const { bucket, due_date, row, rule } = reminderPayload(event);
        if (!event.company_id) return [];
        const ending = rule === 'method_statements_end';
        const overdue = bucket === 'overdue' || isOverdueWeekly(bucket);
        const what = ending ? 'reaches its end date' : 'is due for review';
        return [notifyC({
          audiences: overdue
            ? [...people({ ...event, actor_id: null }, row, authors), cap(event.company_id, 'risk.approve')]
            : orElse(people({ ...event, actor_id: null }, row, authors), cap(event.company_id, 'risk.approve')),
          companyId: event.company_id, type: 'safety_doc_review_due', urgent: overdue,
          title: `${docLabel(noun, row)} ${overdue ? (ending ? 'has passed its end date' : 'is overdue for review') : `${what} on ${due_date}`}`,
          link: { portal: docPath(kind, event.entity_id) },
        })];
      },
    },
  ]);
}

async function escalationRoles(ctx: RuleContext, severity: string): Promise<{ roles: string[]; staff: boolean }> {
  const { data } = await ctx.sb.from('incident_escalation_rules')
    .select('company_id, notify_roles, notify_staff')
    .eq('severity', severity).eq('active', true)
    .or(`company_id.eq.${ctx.event.company_id},company_id.is.null`);
  const rows = (data ?? []) as { company_id: string | null; notify_roles: string[]; notify_staff: boolean }[];
  // An organisation's own rules replace the platform defaults entirely.
  const own = rows.filter(r => r.company_id === ctx.event.company_id);
  const use = own.length ? own : rows.filter(r => !r.company_id);
  return { roles: [...new Set(use.flatMap(r => r.notify_roles))], staff: use.some(r => r.notify_staff) };
}

const incidentLabel = (n: Record<string, unknown>) =>
  `${s(n.incident_number, 'Incident')} (${HS_INCIDENT_TYPE_LABELS[n.incident_type as HsIncidentType] ?? s(n.incident_type).replace(/_/g, ' ')})`;

export const safetyRules: Rule[] = [
  // ── Hazards ───────────────────────────────────────────────────
  {
    id: 'hazard_reported',
    on: 'hazards.created',
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      return [notifyC({
        audiences: [cap(event.company_id, 'hazard.manage')], companyId: event.company_id, type: 'hazard_reported',
        urgent: n.perceived_seriousness === 'very_high',
        title: `Hazard reported: ${s(n.reference)}${n.perceived_seriousness ? ` — seriousness ${s(n.perceived_seriousness).replace(/_/g, ' ')}` : ''}`,
        link: { portal: hazardPath(event.entity_id) },
      })];
    },
  },
  {
    id: 'hazard_assigned',
    on: 'hazards.updated',
    when: e => changedTo(e, 'owner_id') && !!rowPayload(e).new.owner_id && rowPayload(e).new.owner_id !== e.actor_id,
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      return [notifyC({
        audiences: user(n.owner_id), companyId: event.company_id, type: 'hazard_assigned',
        title: `Hazard ${s(n.reference)} assigned to you`,
        link: { portal: hazardPath(event.entity_id) },
      })];
    },
  },
  {
    id: 'hazard_unassessed',
    on: 'hazards.reminder',
    then: ({ event }) => {
      const { row } = reminderPayload(event);
      if (!event.company_id) return [];
      return [notifyC({
        audiences: [...user(row.owner_id), cap(event.company_id, 'hazard.manage')], companyId: event.company_id, type: 'hazard_reported',
        title: `Hazard ${s(row.reference)} has not been assessed yet`,
        link: { portal: hazardPath(event.entity_id) },
      })];
    },
  },

  // ── Controlled documents: RA, RAMS, COSHH ──────────────────────
  ...docRules(),

  // ── Incidents ─────────────────────────────────────────────────
  {
    // Severity is unconfirmed at report time, so this is a triage
    // prompt, never an escalation. The number and type only.
    id: 'incident_reported',
    on: 'hs_incidents.created',
    then: async ({ event, companyName }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const out: Consequence[] = [
        notifyC({
          audiences: [cap(event.company_id, 'incident.investigate')], companyId: event.company_id, type: 'hs_incident_reported',
          title: `Incident reported: ${incidentLabel(n)} — needs triage`,
          link: { portal: incidentPath(event.entity_id) },
        }),
        notifyC({
          audiences: [staff], companyId: event.company_id, type: 'hs_incident_reported',
          title: `${await companyName() || 'A client'}: incident reported — ${incidentLabel(n)}`,
          link: { admin: `/health-safety/${event.company_id}/incidents` },
        }),
      ];
      if (n.riddor_review_status === 'review_required') {
        out.push(notifyC({
          audiences: [cap(event.company_id, 'riddor.review')], companyId: event.company_id, type: 'riddor_review_required',
          title: `RIDDOR review needed: ${incidentLabel(n)}`,
          body: 'This type of incident always gets a RIDDOR review. A person with RIDDOR authority records the decision and the reason.',
          link: { portal: incidentPath(event.entity_id) },
        }));
      }
      return out;
    },
  },
  {
    // Escalation follows the CONFIRMED severity, by the organisation's
    // own rules or else the platform defaults (125).
    id: 'incident_escalated',
    on: 'hs_incidents.updated',
    when: e => changedTo(e, 'severity_confirmed_at') && !!rowPayload(e).new.severity_confirmed_at && !!rowPayload(e).new.severity,
    then: async (ctx) => {
      const { event, companyName } = ctx;
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const severity = s(n.severity);
      const { roles, staff: withStaff } = await escalationRoles(ctx, severity);
      const urgent = (HS_VERIFY_SEVERITIES as readonly string[]).includes(severity);
      const label = HS_INCIDENT_SEVERITY_LABELS[severity as HsIncidentSeverity] ?? severity;
      const out: Consequence[] = [];
      if (roles.length) {
        out.push(notifyC({
          audiences: [{ kind: 'roles', companyId: event.company_id, roles }], companyId: event.company_id, type: 'hs_incident_escalated', urgent,
          title: `${incidentLabel(n)}: severity confirmed as ${label}`,
          link: { portal: incidentPath(event.entity_id) },
        }));
      }
      if (withStaff) {
        out.push(notifyC({
          audiences: [staff], companyId: event.company_id, type: 'hs_incident_escalated', urgent,
          title: `${await companyName() || 'A client'}: ${incidentLabel(n)} confirmed ${label}`,
          link: { admin: `/health-safety/${event.company_id}/incidents` },
        }));
      }
      return out;
    },
  },
  {
    id: 'incident_riddor_flagged',
    on: 'hs_incidents.updated',
    when: e => changedTo(e, 'riddor_review_status', ['potentially_reportable']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      return [notifyC({
        audiences: [cap(event.company_id, 'riddor.review'), staff], companyId: event.company_id, type: 'riddor_review_required', urgent: true,
        title: `${incidentLabel(n)} may be RIDDOR reportable — a decision is needed`,
        link: { portal: incidentPath(event.entity_id), admin: `/health-safety/${event.company_id}/incidents` },
      })];
    },
  },
  {
    // A person decided it IS reportable. Reporting to the HSE is done
    // by a human through RIDDOR online — never by this platform — so
    // the consequence is a task for the account owner and a note to
    // the organisation's RIDDOR holders. No day count is asserted: the
    // reporting window depends on the category.
    id: 'incident_riddor_reportable',
    on: 'hs_incidents.updated',
    when: e => changedTo(e, 'riddor_review_status', ['confirmed_reportable']),
    then: async ({ event, companyName }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const company = await companyName();
      return [
        notifyC({
          audiences: [cap(event.company_id, 'riddor.review'), staff], companyId: event.company_id, type: 'riddor_review_required', urgent: true,
          title: `${incidentLabel(n)} is RIDDOR reportable — record the report once it is made`,
          link: { portal: incidentPath(event.entity_id), admin: `/health-safety/${event.company_id}/incidents` },
        }),
        {
          kind: 'run', label: `riddor report task ${event.entity_id}`,
          fn: async (sb) => {
            const owner = await staffOwnerFor(sb, event.company_id);
            await createKeyedInternalTask(sb, {
              company_id: event.company_id, assigned_to: owner, priority: 'urgent',
              title: `RIDDOR: report ${s(n.incident_number, 'incident')} to the HSE — ${company || 'client'}`,
              description: 'A person with RIDDOR authority has decided this incident is reportable. Report it via RIDDOR online without delay, then record the reference and date on the RIDDOR review.',
              source_ref: `hs_incident_riddor:${event.entity_id}`,
            });
          },
        },
      ];
    },
  },
  {
    id: 'incident_riddor_unresolved',
    on: 'hs_incidents.reminder',
    then: ({ event }) => {
      const { row } = reminderPayload(event);
      if (!event.company_id) return [];
      return [notifyC({
        audiences: [cap(event.company_id, 'riddor.review'), staff], companyId: event.company_id, type: 'riddor_review_required', urgent: true,
        title: row.riddor_review_status === 'confirmed_reportable'
          ? `${incidentLabel(row)}: the RIDDOR report has not been recorded as made`
          : `${incidentLabel(row)}: the RIDDOR review still has no decision`,
        link: { portal: incidentPath(event.entity_id), admin: `/health-safety/${event.company_id}/incidents` },
      })];
    },
  },
  {
    id: 'incident_closed',
    on: 'hs_incidents.updated',
    when: e => changedTo(e, 'status', ['closed']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      return [notifyC({
        audiences: [cap(event.company_id, 'incident.read'), ...people(event, n, ['reported_by'])], companyId: event.company_id,
        type: 'hs_incident_status_changed',
        title: `${incidentLabel(n)} has been closed`,
        link: { portal: incidentPath(event.entity_id) },
      })];
    },
  },

  // ── Investigations ────────────────────────────────────────────
  {
    id: 'investigation_assigned',
    on: 'incident_investigations.created',
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const aud = people(event, n, ['lead_investigator_id']);
      if (!aud.length) return [];
      return [notifyC({
        audiences: aud, companyId: event.company_id, type: 'investigation_assigned',
        title: `You are leading investigation ${s(n.reference)}`,
        link: { portal: incidentPath(s(n.incident_id)) },
      })];
    },
  },
  {
    id: 'investigation_reassigned',
    on: 'incident_investigations.updated',
    when: e => changedTo(e, 'lead_investigator_id'),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const aud = people(event, n, ['lead_investigator_id']);
      if (!aud.length) return [];
      return [notifyC({
        audiences: aud, companyId: event.company_id, type: 'investigation_assigned',
        title: `You are now leading investigation ${s(n.reference)}`,
        link: { portal: incidentPath(s(n.incident_id)) },
      })];
    },
  },
  {
    id: 'investigation_submitted',
    on: 'incident_investigations.updated',
    when: e => changedTo(e, 'status', ['pending_approval']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      return [notifyC({
        audiences: [cap(event.company_id, 'incident.approve')], companyId: event.company_id, type: 'investigation_submitted',
        title: `Investigation ${s(n.reference)} is ready for approval`,
        link: { portal: incidentPath(s(n.incident_id)) },
      })];
    },
  },
  {
    id: 'investigation_decided',
    on: 'incident_investigations.updated',
    when: e => changedTo(e, 'status', ['approved', 'changes_requested']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const aud = people(event, n, ['lead_investigator_id']);
      if (!aud.length) return [];
      return [notifyC({
        audiences: aud, companyId: event.company_id, type: 'investigation_decided',
        title: n.status === 'approved' ? `Investigation ${s(n.reference)} approved` : `Changes requested on investigation ${s(n.reference)}`,
        link: { portal: incidentPath(s(n.incident_id)) },
      })];
    },
  },
  {
    id: 'investigation_overdue',
    on: 'incident_investigations.reminder',
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      if (!event.company_id) return [];
      const overdue = bucket !== 'due_7';
      return [notifyC({
        audiences: overdue
          ? [...user(row.lead_investigator_id), cap(event.company_id, 'incident.approve')]
          : orElse(user(row.lead_investigator_id), cap(event.company_id, 'incident.approve')),
        companyId: event.company_id, type: 'investigation_overdue', urgent: overdue,
        title: overdue ? `Investigation ${s(row.reference)} is past its target date (${due_date})` : `Investigation ${s(row.reference)} is due ${due_date}`,
        link: { portal: incidentPath(s(row.incident_id)) },
      })];
    },
  },

  // ── Corrective actions (the universal action table) ────────────
  {
    id: 'safety_action_assigned',
    on: 'actions.created',
    when: e => {
      const n = rowPayload(e).new;
      return !!n.assigned_to && n.assigned_to !== e.actor_id && (SAFETY_ACTION_SOURCES as readonly string[]).includes(s(n.source_type));
    },
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      return [notifyC({
        audiences: user(n.assigned_to), companyId: event.company_id, type: 'action_assigned',
        title: `Action assigned to you: ${s(n.title)}`,
        body: n.due_date ? `Due ${s(n.due_date)}` : null,
        link: { portal: PROTECT_PATHS.actions },
      })];
    },
  },
  {
    id: 'safety_action_reassigned',
    on: 'actions.updated',
    when: e => {
      const n = rowPayload(e).new;
      return changedTo(e, 'assigned_to') && !!n.assigned_to && n.assigned_to !== e.actor_id
        && (SAFETY_ACTION_SOURCES as readonly string[]).includes(s(n.source_type));
    },
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      return [notifyC({
        audiences: user(n.assigned_to), companyId: event.company_id, type: 'action_assigned',
        title: `Action assigned to you: ${s(n.title)}`,
        link: { portal: PROTECT_PATHS.actions },
      })];
    },
  },
  {
    id: 'action_verification_requested',
    on: 'actions.updated',
    when: e => changedTo(e, 'status', ['awaiting_verification']),
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      if (!event.company_id) return [];
      const aud = n.verifier_id ? user(n.verifier_id) : [cap(event.company_id, 'actions.assign')];
      return [notifyC({
        audiences: aud, companyId: event.company_id, type: 'action_verification_requested',
        title: `Please verify: ${s(n.title)}`,
        body: 'The work is recorded as done. Check it and verify it, or send it back with a reason.',
        link: { portal: PROTECT_PATHS.actions },
      })];
    },
  },
  {
    id: 'action_verification_rejected',
    on: 'actions.updated',
    when: e => {
      const p = rowPayload(e);
      return p.changed.includes('status') && p.old.status === 'awaiting_verification' && ['active', 'in_progress'].includes(s(p.new.status));
    },
    then: ({ event }) => {
      const { new: n } = rowPayload(event);
      const aud = user(n.assigned_to);
      if (!aud.length) return [];
      return [notifyC({
        audiences: aud, companyId: event.company_id, type: 'action_verification_rejected', urgent: true,
        title: `Not verified — more needed: ${s(n.title)}`,
        link: { portal: PROTECT_PATHS.actions },
      })];
    },
  },
  {
    id: 'safety_action_overdue',
    on: 'actions.reminder',
    then: ({ event }) => {
      const { bucket, due_date, row } = reminderPayload(event);
      if (!event.company_id) return [];
      const overdue = bucket === 'overdue' || isOverdueWeekly(bucket);
      const who = row.status === 'awaiting_verification'
        ? (row.verifier_id ? user(row.verifier_id) : [cap(event.company_id, 'actions.assign')])
        : (row.assigned_to ? user(row.assigned_to) : [cap(event.company_id, 'actions.assign')]);
      return [notifyC({
        audiences: [...who, ...(isOverdueWeekly(bucket) ? [cap(event.company_id, 'actions.assign')] : [])],
        companyId: event.company_id, type: 'action_overdue', urgent: overdue,
        title: overdue ? `Overdue since ${due_date}: ${s(row.title)}` : `Due ${due_date}: ${s(row.title)}`,
        link: { portal: PROTECT_PATHS.actions },
      })];
    },
  },
];
