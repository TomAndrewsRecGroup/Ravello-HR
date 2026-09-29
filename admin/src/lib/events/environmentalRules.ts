import type { Audience } from '@/lib/notify/notify';
import type { Consequence, Rule } from './rules';
import { changedTo, rowPayload, type PlatformEvent } from './types';

// Core-OS 360 Phase 5, Group 1 (migration 156): Environmental aspects &
// impacts. Its own file, not folded into hsRules.ts, because
// Environmental is its own EHS pillar alongside H&S — the same
// "genuinely different content gets its own file" call leadRules.ts /
// hireRules.ts / supportRules.ts already made for LEAD / HIRE / Support.
//
// The ONLY consequence here is "an aspect was confirmed significant" —
// never a Jev call, never an auto-decided significance. The decision
// itself (likelihood x severity x frequency, human-confirmed) already
// happened, synchronously, inside the environmental_aspect_assessments
// insert and its roll-forward trigger; this rule only REPORTS what
// already happened, the same posture inspection_completed (Phase 4,
// Group 3/4) already established for asset defects.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const staffOnly: Audience[] = [{ kind: 'staff' }];
const admins = (companyId: string): Audience[] => [{ kind: 'company_admins', companyId }];

async function aspectActivity(sb: { from: (t: string) => any }, aspectId: string): Promise<string> {
  const { data } = await sb.from('environmental_aspects').select('activity').eq('id', aspectId).maybeSingle();
  return (data as { activity?: string } | null)?.activity ?? 'An environmental aspect';
}

export const environmentalRules: Rule[] = [
  {
    // Rule 1 (never a second action table): a significant aspect is an
    // `actions` row (source_type 'environmental_aspect', a value 156's
    // migration added to the shared CHECK), keyed on the aspect id so a
    // re-processed event or a later re-confirmation of the SAME aspect
    // row never raises two.
    id: 'environmental_aspect_significant',
    on: 'environmental_aspects.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['confirmed_significant']),
    then: async ({ event, sb, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const activity = await aspectActivity(sb, event.entity_id);
      const company = await companyName();
      const out: Consequence[] = [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `environmental_aspect:${event.entity_id}`,
          row: {
            action_type: 'environmental_significant_aspect',
            priority: 'high',
            title: `Significant environmental aspect: ${activity}`.slice(0, 200),
            description: 'This aspect has been assessed and confirmed significant. Review and put in place appropriate controls.',
            related_entity_type: 'environmental_aspect',
            related_entity_id: event.entity_id,
            source_type: 'environmental_aspect',
            source_id: event.entity_id,
            created_by_admin: true,
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'environmental_aspect_significant',
            title: `Significant environmental aspect confirmed: ${activity}`,
            body:  'An action has been added to your PROTECT actions to review controls for this aspect.',
            link:  { portal: '/protect/environmental-aspects' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'environmental_aspect_significant',
            title: `${company || 'A client'}: environmental aspect confirmed significant — ${activity}`,
            link:  { admin: `/health-safety/${event.company_id}/environmental-aspects` },
          },
        },
      ];
      return out;
    },
  },

  // ── Group 2 (157): spills, waste, monitoring, permits & conditions ──

  {
    // A spill is always logged; it only raises an action when it is
    // NOT contained — a contained spill is handled and needs no
    // separate corrective action beyond the record itself.
    id: 'environmental_spill_reported',
    on: 'environmental_spills.created',
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const p = event.payload as { new?: Record<string, unknown> };
      const contained = Boolean(p.new?.contained);
      const receiving = s(p.new?.receiving_environment, 'the environment').replace(/_/g, ' ');
      const company = await companyName();
      const out: Consequence[] = [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'environmental_spill_reported',
            title: `Spill reported (${receiving})`,
            body: contained ? 'The spill has been recorded as contained.' : 'The spill has been recorded and is not yet contained.',
            link: { portal: '/protect/environmental-aspects' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'environmental_spill_reported',
            title: `${company || 'A client'}: spill reported (${receiving})`,
            link: { admin: `/health-safety/${event.company_id}/environmental-spills` },
          },
        },
      ];
      if (!contained) {
        out.push({
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `environmental_spill:${event.entity_id}`,
          row: {
            action_type: 'environmental_spill_response',
            priority: 'urgent',
            title: `Contain and respond to spill (${receiving})`.slice(0, 200),
            description: 'A recorded spill has not yet been contained. Take action to contain and remediate.',
            related_entity_type: 'environmental_spill',
            related_entity_id: event.entity_id,
            source_type: 'environmental_spill',
            source_id: event.entity_id,
            created_by_admin: true,
          },
        });
      }
      return out;
    },
  },

  {
    // Routine waste movements notify nobody (rule 8: on exceedance/
    // incident only) — this rule only ever fires a consequence when
    // non_conformance is true, whether set at insert or a later update.
    id: 'waste_movement_non_conformance',
    on: 'waste_movements.created',
    when: (e: PlatformEvent) => Boolean((rowPayload(e).new as { non_conformance?: boolean }).non_conformance),
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const company = await companyName();
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `waste_movement:${event.entity_id}`,
          row: {
            action_type: 'environmental_waste_non_conformance',
            priority: 'high',
            title: 'Waste movement non-conformance',
            description: 'A waste movement was recorded with a non-conformance. Review and take corrective action.',
            related_entity_type: 'waste_movement',
            related_entity_id: event.entity_id,
            source_type: 'waste_movement',
            source_id: event.entity_id,
            created_by_admin: true,
          },
        },
        { kind: 'notify', input: { audiences: admins(event.company_id), companyId: event.company_id, type: 'waste_non_conformance',
            title: 'Waste movement non-conformance recorded', link: { portal: '/protect/environmental-aspects' } } },
        { kind: 'notify', input: { audiences: staffOnly, companyId: event.company_id, type: 'waste_non_conformance',
            title: `${company || 'A client'}: waste movement non-conformance`, link: { admin: `/health-safety/${event.company_id}/environmental-waste` } } },
      ];
    },
  },
  {
    // The same non-conformance rule also needs to catch a movement
    // corrected to non_conformance=true on a LATER update (it started
    // routine, non-conformance was found afterwards).
    id: 'waste_movement_non_conformance_updated',
    on: 'waste_movements.updated',
    when: (e: PlatformEvent) => changedTo(e, 'non_conformance', ['true']),
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const company = await companyName();
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `waste_movement:${event.entity_id}`,
          row: {
            action_type: 'environmental_waste_non_conformance',
            priority: 'high',
            title: 'Waste movement non-conformance',
            description: 'A waste movement was recorded with a non-conformance. Review and take corrective action.',
            related_entity_type: 'waste_movement',
            related_entity_id: event.entity_id,
            source_type: 'waste_movement',
            source_id: event.entity_id,
            created_by_admin: true,
          },
        },
        { kind: 'notify', input: { audiences: admins(event.company_id), companyId: event.company_id, type: 'waste_non_conformance',
            title: 'Waste movement non-conformance recorded', link: { portal: '/protect/environmental-aspects' } } },
        { kind: 'notify', input: { audiences: staffOnly, companyId: event.company_id, type: 'waste_non_conformance',
            title: `${company || 'A client'}: waste movement non-conformance`, link: { admin: `/health-safety/${event.company_id}/environmental-waste` } } },
      ];
    },
  },

  {
    // within_limit is a database-computed fact (GENERATED, never
    // trusted from anywhere else) — this rule only reports it. Never
    // "non-compliant": a recorded value simply exceeded a recorded
    // limit, which is all the database knows.
    id: 'environmental_monitoring_exceedance',
    on: 'environmental_monitoring.created',
    when: (e: PlatformEvent) => (rowPayload(e).new as { within_limit?: boolean | null }).within_limit === false,
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const p = event.payload as { new?: Record<string, unknown> };
      const parameter = s(p.new?.parameter, 'A monitored parameter');
      const company = await companyName();
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `environmental_monitoring:${event.entity_id}`,
          row: {
            action_type: 'environmental_monitoring_exceedance',
            priority: 'high',
            title: `Recorded value exceeded the recorded limit: ${parameter}`.slice(0, 200),
            description: 'The recorded value exceeded the recorded limit for this parameter. Review and take appropriate action.',
            related_entity_type: 'environmental_monitoring',
            related_entity_id: event.entity_id,
            source_type: 'environmental_monitoring',
            source_id: event.entity_id,
            created_by_admin: true,
          },
        },
        { kind: 'notify', input: { audiences: admins(event.company_id), companyId: event.company_id, type: 'environmental_monitoring_exceedance',
            title: `Monitoring exceedance recorded: ${parameter}`, link: { portal: '/protect/environmental-aspects' } } },
        { kind: 'notify', input: { audiences: staffOnly, companyId: event.company_id, type: 'environmental_monitoring_exceedance',
            title: `${company || 'A client'}: monitoring exceedance — ${parameter}`, link: { admin: `/health-safety/${event.company_id}/environmental-monitoring` } } },
      ];
    },
  },

  {
    // Environmental permits have no client-facing page for their
    // lifecycle status yet (staff-only, the same posture Groups 7-10
    // of Phase 4 adopted before their own portal pages existed) —
    // widen to admins() once a portal permits page exists.
    id: 'environmental_permit_status_changed',
    on: 'environmental_permits.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['expired', 'surrendered', 'revoked']),
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const p = event.payload as { new?: Record<string, unknown> };
      const status = s(p.new?.status);
      const permitType = s(p.new?.permit_type, 'Environmental permit');
      const company = await companyName();
      return [
        { kind: 'notify', input: { audiences: staffOnly, companyId: event.company_id, type: 'environmental_permit_status_changed',
            title: `${company || 'A client'}: ${permitType} — ${status}`, link: { admin: `/health-safety/${event.company_id}/environmental-permits` } } },
      ];
    },
  },

  {
    id: 'environmental_permit_condition_review',
    on: 'permit_conditions.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['breach_recorded', 'review_required']),
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const p = event.payload as { new?: Record<string, unknown> };
      const status = s(p.new?.status).replace(/_/g, ' ');
      const company = await companyName();
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `permit_condition:${event.entity_id}`,
          row: {
            action_type: 'environmental_permit_condition_review',
            priority: 'high',
            title: `Permit condition needs review (${status})`.slice(0, 200),
            description: 'A permit condition was recorded as needing review. Read the condition and evidence on file.',
            related_entity_type: 'permit_condition',
            related_entity_id: event.entity_id,
            source_type: 'environmental_permit_condition',
            source_id: event.entity_id,
            created_by_admin: true,
          },
        },
        { kind: 'notify', input: { audiences: admins(event.company_id), companyId: event.company_id, type: 'environmental_permit_condition_review',
            title: `Permit condition needs review (${status})`, link: { portal: '/protect/environmental-aspects' } } },
        { kind: 'notify', input: { audiences: staffOnly, companyId: event.company_id, type: 'environmental_permit_condition_review',
            title: `${company || 'A client'}: permit condition — ${status}`, link: { admin: `/health-safety/${event.company_id}/environmental-permits` } } },
      ];
    },
  },
];
