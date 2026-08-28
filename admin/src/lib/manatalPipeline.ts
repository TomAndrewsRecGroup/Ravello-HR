// Shape the admin applicant list, independent of any I/O.
//
// Lives here rather than in the route so it can be tested without the
// Next request machinery — and because the rule it enforces is the kind
// that fails silently: EVERY match must produce a row.

import { isJobBoardApplicant, manatalRefId, type ManatalMatch } from './manatal';

/**
 * A candidate as it arrives from EITHER Manatal API version.
 *
 * Measured 2026-08-28 — the two reads disagree about the name:
 *   /open/v1/matches/     → candidate: { first_name, last_name, email }
 *   /open/v3/candidates/  → { full_name, email }
 *
 * Reading only one shape is how this page ends up listing seven rows of
 * "Candidate #163544005". Both are accepted, and `displayName` is the
 * one place that decides.
 */
export interface NamedCandidate {
  id?:         number | string;
  full_name?:  string | null;
  first_name?: string | null;
  last_name?:  string | null;
  email?:      string | null;
}

export function displayName(c: NamedCandidate | undefined): string | null {
  if (!c) return null;
  const full = (c.full_name ?? '').trim();
  if (full) return full;
  const joined = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return joined || null;
}

export interface AdminPipelineRow {
  id:            number;
  candidate_id:  string;
  full_name:     string | null;
  email:         string | null;
  stage:         { id: number; name: string };
  is_active:     boolean;
  /** Did they apply, or did a recruiter attach them? The referral
   *  pipeline only ever refers the former, so the UI shows which is
   *  which rather than leaving the operator to wonder why a name on
   *  this list never appears in the referral funnel. */
  applied:       boolean;
  created_at:    string;
}

/**
 * Merge the job-scoped v3 match list with the v1 name/email lookup.
 *
 * Extracted and pure so the rule that matters can be asserted: EVERY
 * match produces a row. Hydration is a label, not a filter — a
 * `.map()` that quietly became a `.filter()`, or a lookup keyed on the
 * wrong id shape, would drop applicants from a page whose whole job is
 * to show all of them, and the result would look like a quiet role
 * rather than a broken one.
 */
export function buildPipelineRows(
  matches: ManatalMatch[],
  orgMatches: ManatalMatch[],
  /** Extra names keyed by candidate id, from the per-candidate v3 read.
   *  Used to fill in anyone the bulk lookup could not name. */
  extraNames: Map<string, NamedCandidate> = new Map(),
): AdminPipelineRow[] {
  const byCandidate = new Map<string, NamedCandidate>();
  for (const m of orgMatches) {
    const c = m.candidate;
    if (c && typeof c === 'object') byCandidate.set(manatalRefId(c), c as NamedCandidate);
  }

  return matches.map(m => {
    const candidateId = manatalRefId(m.candidate);
    const c = byCandidate.get(candidateId) ?? extraNames.get(candidateId);
    return {
      id:           m.id,
      candidate_id: candidateId,
      full_name:    displayName(c),
      email:        c?.email ?? null,
      stage:        m.stage ?? { id: 0, name: 'Unknown' },
      is_active:    m.is_active,
      applied:      isJobBoardApplicant(m),
      created_at:   m.created_at,
    };
  });
}

