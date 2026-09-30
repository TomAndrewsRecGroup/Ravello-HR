// Core-OS 360 Phase 5, Group 8: the pure half of the Legal Register's
// "Broadcast this" link (?legal=<id> on /broadcast). Extracted out of
// page.tsx's server-only data fetching so the MAPPING from a
// requirement + its recorded obligations to a BroadcastPrefill is
// unit-testable without a Supabase client — the same "pure computation
// extracted from a server component" shape computeValueReport() /
// computeGovernanceKpis() already use elsewhere in this codebase.
//
// Only companies that have actually recorded this requirement as
// 'applicable' are pre-selected — never every client on the platform,
// and never a client whose applicability was merely 'under_review' or
// left 'not_assessed'. This is a STARTING POINT for the compose form;
// BroadcastClient's own confirm-modal is what a staff member reviews
// and can change or clear entirely before Send.

export interface BroadcastPrefillResult {
  title: string;
  description: string;
  companyIds: string[];
  // Core-OS 360 Completion Programme, Phase 25, Group 6 (C17.7): the
  // research/regulatory origin this broadcast was raised from — carried
  // through to broadcast_sends (migration 194) and, from there, onto
  // every action it raises (source_type 'regulatory_broadcast'), so the
  // completion of a broadcast's actions can be traced back to the
  // research that prompted it. Only set when the prefill genuinely came
  // from one of the two traced origins — never invented for a hand-typed
  // broadcast.
  sourceType?: 'legal_requirement' | 'regulatory_update';
  sourceId?:   string;
}

export function buildLegalPrefill(
  requirement: { id: string; title: string } | null,
  applicableCompanyIds: string[],
): BroadcastPrefillResult | null {
  if (!requirement) return null;
  return {
    title: `Legal update: ${requirement.title}`.slice(0, 200),
    description: '',
    companyIds: [...new Set(applicableCompanyIds)],
    sourceType: 'legal_requirement',
    sourceId: requirement.id,
  };
}
