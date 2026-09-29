import { createServiceSupabaseClient } from './portfolioAccess';
import type { ConsultancyVisitReport } from './types';

/** The report a consultant is currently working on for this visit — the
 *  newest row that is not superseded. That is either an in-progress
 *  draft (a fresh report, or a revision of an issued one) or, once
 *  nothing is being drafted, the current issued version itself. A
 *  superseded row is history, never "current" — see migration 176's
 *  own versioning discipline. */
export async function loadVisitReport(visitId: string): Promise<ConsultancyVisitReport | null> {
  const sb = createServiceSupabaseClient();
  const { data } = await sb.from('consultancy_visit_reports')
    .select('*').eq('visit_id', visitId).neq('status', 'superseded')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as ConsultancyVisitReport | null) ?? null;
}
