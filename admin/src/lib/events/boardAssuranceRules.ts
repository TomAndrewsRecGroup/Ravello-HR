import type { Audience } from '@/lib/notify/notify';
import type { Consequence, Rule } from './rules';
import { changedTo, type PlatformEvent } from './types';

// Core-OS 360 Phase 13, Group 1: Board Assurance & Executive Reporting.
// Its own file — this is the one place a periodic, cross-pillar
// governance ARTEFACT (not a single record) reaches the client, the
// same "genuinely different content gets its own file" call
// governanceRules.ts/legalRegisterRules.ts already made for their own
// domains.
//
// ABSOLUTE RULE: nothing here decides anything. draft -> issued is a
// staff action taken directly on the row (board_assurance_reports_
// guard() only stamps issued_at/issued_by; it never chooses to
// transition on its own). This file only REPORTS that it happened —
// the same posture management_review_completed already established.

const admins = (companyId: string): Audience[] => [{ kind: 'company_admins', companyId }];
const staffOnly: Audience[] = [{ kind: 'staff' }];

export const boardAssuranceRules: Rule[] = [
  {
    id: 'board_assurance_report_issued',
    on: 'board_assurance_reports.updated',
    when: (e: PlatformEvent) => changedTo(e, 'status', ['issued']),
    then: async ({ event, companyName }): Promise<Consequence[]> => {
      if (!event.company_id || !event.entity_id) return [];
      const company = await companyName();
      return [
        {
          kind: 'notify',
          input: {
            audiences: staffOnly, companyId: event.company_id, type: 'board_assurance_report_issued',
            title: `${company || 'A client'}: board assurance report issued`,
            link: { admin: `/health-safety/${event.company_id}/board-assurance` },
          },
        },
        {
          kind: 'notify',
          input: {
            audiences: admins(event.company_id), companyId: event.company_id, type: 'board_assurance_report_issued',
            title: 'A board assurance report has been issued for your organisation',
            body: 'See it, and acknowledge it, on your PROTECT board assurance page.',
            link: { portal: '/protect/board-assurance' },
          },
        },
      ];
    },
  },
];
