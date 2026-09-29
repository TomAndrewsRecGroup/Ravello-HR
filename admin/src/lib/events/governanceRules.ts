import type { Audience } from '@/lib/notify/notify';
import type { Consequence, Rule } from './rules';
import { changedTo, rowPayload, type PlatformEvent } from './types';

// Core-OS 360 Phase 5, Group 6 (migration 161): Objectives & Targets,
// and Management Review. Its own file, not folded into
// environmentalRules.ts or legalRegisterRules.ts — this spans every
// EHS pillar (an objective can be tied to ISO 45001 OR 14001, or stand
// alone; a management review looks across all of them at once), the
// same "genuinely different content gets its own file" call
// leadRules.ts/hireRules.ts/supportRules.ts/environmentalRules.ts/
// legalRegisterRules.ts already made for their own domains.
//
// ABSOLUTE RULE: nothing here ever decides anything. An objective's
// status transition (draft/active/on_track/at_risk/achieved/missed/
// abandoned) already happened, synchronously, inside
// objective_measurements_roll() — a deterministic comparison against
// the stored target, never an AI judgement. A management review
// reaching 'completed' is a human action taken directly on the row.
// This file only REPORTS what already happened, the same posture
// inspection_completed/environmental_aspect_significant/legal_
// evaluation_noncompliance already established for their own domains.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const staffOnly: Audience[] = [{ kind: 'staff' }];
const admins = (companyId: string): Audience[] => [{ kind: 'company_admins', companyId }];

export const governanceRules: Rule[] = [
  {
    // Rule 1 (never a second action table): an objective that just
    // became 'at_risk' or 'missed' raises exactly one `actions` row
    // (source_type 'objective'), keyed on the objective id AND the
    // status so a re-processed event never raises two, while a genuine
    // later episode (on_track -> at_risk again, after recovering) still
    // gets its own fresh action.
    id: 'objective_at_risk_or_missed',
    on: 'objectives.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['at_risk', 'missed']),
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const p = rowPayload(event);
      const status = s(p.new.status);
      const title = s(p.new.title, 'An objective');
      const missed = status === 'missed';
      const company = await companyName();
      const out: Consequence[] = [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `objective:${event.entity_id}:${status}`,
          row: {
            action_type: missed ? 'objective_missed' : 'objective_at_risk',
            priority: missed ? 'high' : 'normal',
            title: `Objective ${missed ? 'missed' : 'at risk'}: ${title}`.slice(0, 200),
            description: missed
              ? 'This objective was not achieved by its target date. Review and decide whether to revise, extend or abandon it.'
              : 'Progress against this objective is behind where it needs to be to meet its target date. Review and consider a corrective action plan.',
            related_entity_type: 'objective',
            related_entity_id: event.entity_id,
            source_type: 'objective',
            source_id: event.entity_id,
            created_by_admin: true,
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id,
            type: missed ? 'objective_missed' : 'objective_at_risk',
            title: `Objective ${missed ? 'missed' : 'at risk'}: ${title}`,
            body:  'An action has been added to your PROTECT actions.',
            link:  { portal: '/protect/objectives' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id,
            type: missed ? 'objective_missed' : 'objective_at_risk',
            title: `${company || 'A client'}: objective ${missed ? 'missed' : 'at risk'} — ${title}`,
            link:  { admin: `/health-safety/${event.company_id}/objectives` },
          },
        },
      ];
      return out;
    },
  },

  {
    // A quieter, positive milestone — staff-only plus a client notice,
    // never an action (there is nothing left to do).
    id: 'objective_achieved',
    on: 'objectives.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['achieved']),
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const p = rowPayload(event);
      const title = s(p.new.title, 'An objective');
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'objective_achieved',
            title: `Objective achieved: ${title}`,
            link:  { portal: '/protect/objectives' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'objective_achieved',
            title: `${company || 'A client'}: objective achieved — ${title}`,
            link:  { admin: `/health-safety/${event.company_id}/objectives` },
          },
        },
      ];
    },
  },

  {
    // A management review reaching 'completed' is a human action taken
    // directly on the row (the UI's "Complete review" button) — staff
    // only, since the client-facing summary of WHAT was decided is the
    // decisions themselves, not the meeting's own status.
    id: 'management_review_completed',
    on: 'management_reviews.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['completed']),
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'management_review_completed',
            title: `${company || 'A client'}: management review completed`,
            link:  { admin: `/health-safety/${event.company_id}/management-review` },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'management_review_completed',
            title: 'A management review has been completed for your organisation',
            body:  'See the decisions reached on your PROTECT management review page.',
            link:  { portal: '/protect/management-review' },
          },
        },
      ];
    },
  },

  {
    // Core-OS 360 Phase 5, Group 7 (162): a routine worker consultation
    // record — staff-managed, so the client just gets told it happened
    // (never a client action; consultation records are simple
    // record-keeping, not a workflow engine). Never puts the topic/
    // outcome_summary free text into the notification title.
    id: 'consultation_recorded',
    on: 'consultation_records.created',
    then: async ({ event }): Promise<Consequence[]> => {
      if (!event.company_id) return [];
      return [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'consultation_recorded',
            title: 'A worker consultation has been recorded for your organisation',
            link:  { portal: '/protect/consultation' },
          },
        },
      ];
    },
  },
];
