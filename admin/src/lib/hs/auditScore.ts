import type { HsAuditRating } from './vocab';

// Pure scoring for an on-site audit: the percentage of answered
// checklist items that passed, out of pass+fail (an 'na' answer is
// neither evidence of compliance nor a finding, so it is excluded from
// both sides of the ratio rather than counted as a pass or a fail).
//
// Computed once, in the submit route, and stored on hs_audits.score —
// there is only one write path for an audit (the submit route), so
// unlike hs_next_due() this has no SQL mirror to keep in step with.

export interface AuditResponseInput {
  rating: HsAuditRating;
}

/** null when every answer is 'na' (or there are no answers) — an audit
 *  cannot be "0% compliant" from zero applicable questions. */
export function computeAuditScore(responses: readonly AuditResponseInput[]): number | null {
  const pass = responses.filter(r => r.rating === 'pass').length;
  const fail = responses.filter(r => r.rating === 'fail').length;
  const applicable = pass + fail;
  if (applicable === 0) return null;
  return Math.round((pass / applicable) * 100);
}

/** How many findings (failed answers) an audit raised. */
export function countFindings(responses: readonly AuditResponseInput[]): number {
  return responses.filter(r => r.rating === 'fail').length;
}
