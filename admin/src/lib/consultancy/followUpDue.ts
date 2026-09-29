// Core-OS 360 Phase 7, Group 6. A report's own next_visit_recommended_
// date (176) means nothing on its own — the useful question is whether
// a follow-up visit has actually been BOOKED, not whether one has been
// ISSUED (booking is the actionable step; the report for that visit
// can follow later). Kept as a pure function, unit-tested, so the
// reminders cron's query wrapper stays thin: fetch candidates, fetch
// the relevant visits, decide here.

export interface FollowUpCandidate {
  id: string;
  visit_id: string;
  client_organisation_id: string;
  next_visit_recommended_date: string;
}

export interface ClientVisitDate {
  client_organisation_id: string;
  visit_id: string;
  scheduled_date: string;
}

/** A report still needs a follow-up reminder unless the SAME client
 *  already has a DIFFERENT visit scheduled on or after the recommended
 *  date — booked before, on, or after the report was issued; only
 *  "does a later visit exist" matters, not when it was created. */
export function reportsNeedingFollowUp(
  candidates: FollowUpCandidate[], visits: ClientVisitDate[],
): FollowUpCandidate[] {
  return candidates.filter(c => !visits.some(v =>
    v.client_organisation_id === c.client_organisation_id
    && v.visit_id !== c.visit_id
    && v.scheduled_date >= c.next_visit_recommended_date,
  ));
}
