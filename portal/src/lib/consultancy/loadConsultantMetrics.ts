import { createServiceSupabaseClient, portfolioOrgIds, type PortfolioSession } from './portfolioAccess';
import { readAllPages } from '@/lib/supabase/paged';
import { computeConsultantMetrics, type ConsultantMetrics, type MetricsVisit, type MetricsReport, type MetricsObservation, type MetricsAction } from './consultantMetrics';

export async function loadConsultantMetrics(portfolio: PortfolioSession, period: { from: string; to: string }): Promise<ConsultantMetrics> {
  const orgIds = portfolioOrgIds(portfolio.organisations);
  if (orgIds.length === 0) {
    return computeConsultantMetrics({ visits: [], reports: [], observations: [], actions: [] }, period);
  }
  const sb = createServiceSupabaseClient();

  const [visitsPage, reportsPage] = await Promise.all([
    readAllPages<MetricsVisit>((from, to) => sb.from('consultancy_visits')
      .select('id, client_organisation_id, scheduled_date, status').in('client_organisation_id', orgIds).order('id').range(from, to)),
    readAllPages<MetricsReport>((from, to) => sb.from('consultancy_visit_reports')
      .select('id, visit_id, client_organisation_id, status, issued_at, next_visit_recommended_date')
      .in('client_organisation_id', orgIds).order('id').range(from, to)),
  ]);
  const visitIds = visitsPage.rows.map(v => v.id);

  const [observationsPage, actionsPage] = await Promise.all([
    visitIds.length
      ? readAllPages<MetricsObservation>((from, to) => sb.from('visit_observations')
          .select('observation_type, created_at').in('visit_id', visitIds).order('id').range(from, to))
      : Promise.resolve({ rows: [] as MetricsObservation[], truncated: false }),
    readAllPages<MetricsAction>((from, to) => sb.from('actions')
      .select('source_type, status, created_at, completed_at').eq('source_type', 'consultant_visit')
      .in('company_id', orgIds).order('id').range(from, to)),
  ]);

  return computeConsultantMetrics(
    { visits: visitsPage.rows, reports: reportsPage.rows, observations: observationsPage.rows, actions: actionsPage.rows },
    period,
  );
}
