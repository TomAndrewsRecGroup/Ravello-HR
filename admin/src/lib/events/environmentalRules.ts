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
];
