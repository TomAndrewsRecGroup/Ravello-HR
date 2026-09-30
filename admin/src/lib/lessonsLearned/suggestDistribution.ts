// Core-OS 360 Phase 16, Group 1: Cross-Client Lessons Learned Network.
//
// A PLAIN, DETERMINISTIC pre-selection of which clients might benefit
// from a lesson drawn from a given source client — never an AI
// judgement call. "Which clients share this client's sector" is a
// fact this codebase already stores (companies.sector), not something
// that needs a model. This is a convenience only: the staff member
// authoring the lesson still explicitly confirms the distribution
// list before anything is published (Group 2's UI never auto-sends
// based on this alone).
//
// The source client itself is excluded — the lesson was drawn FROM
// their own incident, so re-"distributing" it back to them teaches
// them nothing they don't already know. An inactive company is
// excluded too — there is no one there to read it.

export interface DistributionCandidate {
  id: string;
  name: string;
  sector: string | null;
  active: boolean;
}

export function suggestDistributionTargets(
  companies: readonly DistributionCandidate[],
  sourceCompanyId: string | null,
): string[] {
  if (!sourceCompanyId) return [];
  const source = companies.find(c => c.id === sourceCompanyId);
  if (!source || !source.sector) return [];
  return companies
    .filter(c => c.active && c.id !== sourceCompanyId && c.sector === source.sector)
    .map(c => c.id);
}
