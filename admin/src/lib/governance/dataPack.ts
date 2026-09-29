import type { SupabaseClient } from '@supabase/supabase-js';

// Core-OS 360 Phase 5, Group 6 (migration 161): the management review
// data pack. EVERY number here is a plain count or aggregate, read
// directly from existing tables at generation time — never an
// AI-generated summary, never a conclusion like "the organisation is
// performing well". The caller inserts the RETURNED object verbatim
// into management_review_data_pack.data; nothing here writes anything.

export interface IsoReadinessPackEntry {
  standard_id: string;
  standard_name: string;
  total_clauses: number;
  clauses_with_evidence: number;
  clauses_without_evidence: number;
}

export interface ManagementReviewDataPack {
  generated_at: string;
  /** The previous COMPLETED review's date for this company, or null if
   *  this is the first review — "since" counts below are relative to
   *  this date, or all-time when null. */
  since: string | null;
  open_actions_count: number;
  overdue_compliance_items_count: number;
  incidents_count_since: number;
  environmental_incidents_count_since: number;
  audits_run_count_since: number;
  /** Audits scoring below 70% — a plain, fixed threshold on the
   *  audit's own recorded score, never a judgement about the client. */
  audits_low_score_count_since: number;
  objective_status_breakdown: Record<string, number>;
  legal_obligation_applicability_breakdown: Record<string, number>;
  /** Evaluation EVENTS recorded since the last review, by status —
   *  a count of recorded events, not a deduped "current state per
   *  obligation" figure. */
  legal_evaluation_events_breakdown_since: Record<string, number>;
  iso_readiness: IsoReadinessPackEntry[];
  environmental_aspect_status_breakdown: Record<string, number>;
}

function tally<T extends string>(rows: { value: T | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.value ?? 'unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

async function countExact(sb: SupabaseClient, table: string, build: (q: any) => any): Promise<number> {
  const { count, error } = await build(sb.from(table).select('id', { count: 'exact', head: true }));
  if (error) return 0;
  return count ?? 0;
}

/** Computes the FULL, factual data pack for one company. `sinceDate`
 *  (ISO date or null) is the previous completed review's own
 *  review_date for this company — pass null for a company's first
 *  review, which counts all-time. */
export async function computeManagementReviewDataPack(
  sb: SupabaseClient,
  companyId: string,
  sinceDate: string | null,
): Promise<ManagementReviewDataPack> {
  const sinceTs = sinceDate ? new Date(sinceDate).toISOString() : null;

  const [
    openActions,
    overdueCompliance,
    incidentsSince,
    envIncidentsSince,
    auditsSince,
    auditsLowScoreSince,
    objectives,
    obligations,
    evaluations,
    standards,
    clauses,
    links,
    aspects,
  ] = await Promise.all([
    countExact(sb, 'actions', q => q.eq('company_id', companyId).eq('status', 'active')),
    countExact(sb, 'compliance_items', q => q.eq('company_id', companyId).eq('status', 'overdue')),
    countExact(sb, 'hs_incidents', q => {
      let x = q.eq('company_id', companyId);
      if (sinceTs) x = x.gte('created_at', sinceTs);
      return x;
    }),
    countExact(sb, 'environmental_spills', q => {
      let x = q.eq('company_id', companyId);
      if (sinceTs) x = x.gte('created_at', sinceTs);
      return x;
    }),
    countExact(sb, 'hs_audits', q => {
      let x = q.eq('company_id', companyId);
      if (sinceTs) x = x.gte('created_at', sinceTs);
      return x;
    }),
    countExact(sb, 'hs_audits', q => {
      let x = q.eq('company_id', companyId).lt('score', 70);
      if (sinceTs) x = x.gte('created_at', sinceTs);
      return x;
    }),
    sb.from('objectives').select('status').eq('company_id', companyId).limit(500),
    sb.from('organisation_legal_obligations').select('applicability_status').eq('company_id', companyId).limit(500),
    (async () => {
      let q = sb.from('compliance_evaluations').select('status').eq('company_id', companyId);
      if (sinceTs) q = q.gte('evaluated_at', sinceTs);
      return q.limit(500);
    })(),
    sb.from('management_system_standards').select('id, code, name'),
    sb.from('standard_clauses').select('id, standard_id'),
    sb.from('standard_evidence_links').select('clause_id').eq('company_id', companyId).limit(500),
    sb.from('environmental_aspects').select('status').eq('company_id', companyId).eq('status', 'confirmed_significant').limit(500),
  ]);

  const objectiveRows = (objectives.data ?? []) as { status: string | null }[];
  const obligationRows = (obligations.data ?? []) as { applicability_status: string | null }[];
  const evaluationRows = (evaluations.data ?? []) as { status: string | null }[];
  const standardRows = (standards.data ?? []) as { id: string; code: string; name: string }[];
  const clauseRows = (clauses.data ?? []) as { id: string; standard_id: string }[];
  const linkRows = (links.data ?? []) as { clause_id: string }[];
  const linkedClauseIds = new Set(linkRows.map(l => l.clause_id));
  const aspectRows = (aspects.data ?? []) as { status: string | null }[];

  const isoReadiness: IsoReadinessPackEntry[] = standardRows.map(std => {
    const stdClauses = clauseRows.filter(c => c.standard_id === std.id);
    const withEvidence = stdClauses.filter(c => linkedClauseIds.has(c.id)).length;
    return {
      standard_id: std.id,
      standard_name: std.name,
      total_clauses: stdClauses.length,
      clauses_with_evidence: withEvidence,
      clauses_without_evidence: stdClauses.length - withEvidence,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    since: sinceDate,
    open_actions_count: openActions,
    overdue_compliance_items_count: overdueCompliance,
    incidents_count_since: incidentsSince,
    environmental_incidents_count_since: envIncidentsSince,
    audits_run_count_since: auditsSince,
    audits_low_score_count_since: auditsLowScoreSince,
    objective_status_breakdown: tally(objectiveRows.map(r => ({ value: r.status }))),
    legal_obligation_applicability_breakdown: tally(obligationRows.map(r => ({ value: r.applicability_status }))),
    legal_evaluation_events_breakdown_since: tally(evaluationRows.map(r => ({ value: r.status }))),
    iso_readiness: isoReadiness,
    environmental_aspect_status_breakdown: tally(aspectRows.map(r => ({ value: r.status }))),
  };
}

/** The previous COMPLETED review's own review_date for a company, or
 *  null if there is none — the "since" boundary for a new pack. */
export async function previousCompletedReviewDate(sb: SupabaseClient, companyId: string, excludeReviewId?: string): Promise<string | null> {
  let q = sb.from('management_reviews').select('review_date')
    .eq('company_id', companyId).eq('status', 'completed').order('review_date', { ascending: false }).limit(1);
  if (excludeReviewId) q = q.neq('id', excludeReviewId);
  const { data } = await q;
  const row = (data ?? [])[0] as { review_date?: string } | undefined;
  return row?.review_date ?? null;
}
