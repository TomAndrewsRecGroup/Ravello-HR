import type { Audience } from '@/lib/notify/notify';
import type { Consequence, Rule } from './rules';
import { changedTo, rowPayload, type PlatformEvent } from './types';

// Core-OS 360 Phase 5, Group 4 (migration 159): the Legal Register. Its
// own file, not folded into environmentalRules.ts or hsRules.ts — the
// legal register spans every EHS pillar (H&S, environmental, employment
// law, data protection, …), the same "genuinely different content gets
// its own file" call leadRules.ts/hireRules.ts/supportRules.ts/
// environmentalRules.ts already made for their own domains.
//
// ABSOLUTE RULE: nothing here ever asserts a compliance conclusion.
// compliance_evaluations.status is the one and only cautious vocabulary
// (evidence_current | evidence_incomplete | review_due |
// potential_noncompliance | confirmed_noncompliance | not_evaluated) —
// every notification/action title below quotes that vocabulary or a
// neutral paraphrase of it, never "compliant"/"non-compliant"/"legal"/
// "illegal". Applicability decisions and evaluation events already
// happened, synchronously, inside the database's own triggers before
// this rule ever runs — this file only REPORTS what already happened,
// the same posture inspection_completed/environmental_aspect_
// significant already established.

const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
const staffOnly: Audience[] = [{ kind: 'staff' }];
const admins = (companyId: string): Audience[] => [{ kind: 'company_admins', companyId }];

interface SbLike { from: (t: string) => any }

async function requirementTitleForObligation(sb: SbLike, obligationId: string): Promise<string> {
  const { data: obl } = await sb.from('organisation_legal_obligations')
    .select('legal_requirement_id').eq('id', obligationId).maybeSingle();
  const reqId = (obl as { legal_requirement_id?: string } | null)?.legal_requirement_id;
  if (!reqId) return 'A legal requirement';
  const { data: req } = await sb.from('legal_requirements').select('title').eq('id', reqId).maybeSingle();
  return (req as { title?: string } | null)?.title ?? 'A legal requirement';
}

export const legalRegisterRules: Rule[] = [
  {
    // A human applicability decision (rule 1: never AI, never automatic)
    // just made this requirement apply to the client — tell them and
    // staff. 'not_applicable'/'under_review' are informational states a
    // client does not need pushed at them; only 'applicable' changes
    // what they now need to act on.
    id: 'legal_obligation_applicable',
    on: 'organisation_legal_obligations.updated',
    when: (e: PlatformEvent) => changedTo(e, 'applicability_status', ['applicable']),
    then: async ({ event, sb, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const title = await requirementTitleForObligation(sb, event.entity_id);
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'legal_obligation_applicable',
            title: `A legal requirement now applies to your organisation: ${title}`,
            body:  'Staff have recorded this requirement as applicable to you. See your legal register for evaluation history.',
            link:  { portal: '/protect/legal-register' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'legal_obligation_applicable',
            title: `${company || 'A client'}: "${title}" marked applicable`,
            link:  { admin: `/health-safety/${event.company_id}/legal` },
          },
        },
      ];
    },
  },

  {
    // A routine, clean evaluation. Staff-only — this is the "nothing to
    // see here" case, so no client email for every clean review.
    id: 'legal_evaluation_current',
    on: 'compliance_evaluations.created',
    when: (e: PlatformEvent) => s((rowPayload(e).new as { status?: string }).status) === 'evidence_current',
    then: async ({ event, sb, companyName }): Promise<Consequence[]> => {
      if (!event.company_id) return [];
      const p = rowPayload(event);
      const obligationId = s(p.new.obligation_id);
      const title = obligationId ? await requirementTitleForObligation(sb, obligationId) : 'A legal requirement';
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'legal_evaluation_recorded',
            title: `${company || 'A client'}: evaluation recorded (evidence current) — ${title}`,
            link:  { admin: `/health-safety/${event.company_id}/legal` },
          },
        },
      ];
    },
  },

  {
    // A noncompliance-flavoured evaluation — the one case both the
    // client and staff need told, and the one case that raises a
    // corrective action (never a second action table — the existing
    // `actions.source_type = 'legal_requirement'` value, live since
    // Phase 4). 'confirmed_noncompliance' is urgent; 'potential_
    // noncompliance' is high but not urgent — a possibility, not yet a
    // confirmed finding.
    id: 'legal_evaluation_noncompliance',
    on: 'compliance_evaluations.created',
    when: (e: PlatformEvent) => ['potential_noncompliance', 'confirmed_noncompliance']
      .includes(s((rowPayload(e).new as { status?: string }).status)),
    then: async ({ event, sb, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const p = rowPayload(event);
      const status = s(p.new.status);
      const confirmed = status === 'confirmed_noncompliance';
      const obligationId = s(p.new.obligation_id);
      const title = obligationId ? await requirementTitleForObligation(sb, obligationId) : 'A legal requirement';
      const statusText = status.replace(/_/g, ' ');
      const company = await companyName();
      return [
        {
          kind: 'action',
          companyId: event.company_id,
          sourceRef: `legal_requirement:${event.entity_id}`,
          row: {
            action_type: 'legal_evaluation_finding',
            priority: confirmed ? 'urgent' : 'high',
            title: `Legal register: ${statusText} — ${title}`.slice(0, 200),
            description: 'A compliance evaluation recorded this status. Review the evaluation notes and evidence on file.',
            related_entity_type: 'compliance_evaluation',
            related_entity_id: event.entity_id,
            source_type: 'legal_requirement',
            source_id: obligationId || event.entity_id,
            created_by_admin: true,
            severity: confirmed ? 'critical' : 'high',
            verification_required: confirmed,
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'legal_evaluation_noncompliance',
            urgent: confirmed,
            title: `Legal register update: ${statusText} — ${title}`,
            body:  'An action has been added to your PROTECT actions. This is a recorded evaluation, not a legal conclusion.',
            link:  { portal: '/protect/legal-register' },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'legal_evaluation_noncompliance',
            urgent: confirmed,
            title: `${company || 'A client'}: ${statusText} — ${title}`,
            link:  { admin: `/health-safety/${event.company_id}/legal` },
          },
        },
      ];
    },
  },
];
