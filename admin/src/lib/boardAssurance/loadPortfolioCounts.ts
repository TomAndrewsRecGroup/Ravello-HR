import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';
import { computePortfolioCounts, type PortfolioCounts } from '@/lib/health/portfolioCounts';

/**
 * computePortfolioCounts() (Phase 6) already computes exactly the
 * assurance facts a board wants, but its only existing caller
 * (api/cron/health-snapshot/route.ts) reads every company's rows in
 * one portfolio-wide sweep for the internal, staff-only
 * client_health_snapshots trend. This reads the SAME tables, the SAME
 * columns, scoped to ONE company — never re-deriving the counting
 * logic itself, only the read shape (single-company vs. portfolio-wide).
 */
export async function loadPortfolioCountsForCompany(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ counts: PortfolioCounts; loadError: string | null }> {
  const [
    actionsPage, legalObligationsPage, docsReviewDuePage, incidentsPage,
    deploymentStatusPage, equipmentPage, auditFindingsPage, contractorsPage,
    contractorInsurancesRes, environmentalPermitsPage, managementReviewsPage,
    serviceRequestsPage, consultancyVisitsPage,
  ] = await Promise.all([
    readAllPages<{ company_id: string; status: string; severity: string | null }>(
      (from, to) => supabase.from('actions').select('company_id, status, severity').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ company_id: string; applicability_status: string; next_review_due: string | null }>(
      (from, to) => supabase.from('organisation_legal_obligations').select('company_id, applicability_status, next_review_due').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ company_id: string }>(
      (from, to) => supabase.from('hs_documents').select('company_id').eq('company_id', companyId).eq('status', 'review_due').order('id').range(from, to)),
    readAllPages<{ company_id: string; status: string; severity: string | null }>(
      (from, to) => supabase.from('hs_incidents').select('company_id, status, severity').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ company_id: string; status: string; result: any }>(
      (from, to) => supabase.from('person_deployment_status').select('company_id, status, result').eq('company_id', companyId).order('person_id').range(from, to)),
    readAllPages<{ company_id: string; status: string }>(
      (from, to) => supabase.from('hs_equipment').select('company_id, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ company_id: string; severity: string; closed_at: string | null }>(
      (from, to) => supabase.from('audit_findings').select('company_id, severity, closed_at').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ id: string; company_id: string; approval_status: string }>(
      (from, to) => supabase.from('contractors').select('id, company_id, approval_status').eq('company_id', companyId).order('id').range(from, to)),
    // contractor_insurances has no company_id of its own (scoped via
    // contractor_id) — read after the contractors above are known.
    Promise.resolve({ rows: [] as { contractor_id: string; expires_on: string | null }[], error: null as string | null }),
    readAllPages<{ company_id: string; status: string; expires_on: string | null }>(
      (from, to) => supabase.from('environmental_permits').select('company_id, status, expires_on').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ company_id: string; status: string; review_date: string | null }>(
      (from, to) => supabase.from('management_reviews').select('company_id, status, review_date').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ company_id: string; status: string }>(
      (from, to) => supabase.from('service_requests').select('company_id, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ client_organisation_id: string; status: string; scheduled_date: string }>(
      (from, to) => supabase.from('consultancy_visits').select('client_organisation_id, status, scheduled_date').eq('client_organisation_id', companyId).order('id').range(from, to)),
  ]);

  const contractorIds = contractorsPage.rows.map(c => c.id);
  const contractorInsurancesPage = contractorIds.length > 0
    ? await readAllPages<{ contractor_id: string; expires_on: string | null }>(
        (from, to) => supabase.from('contractor_insurances').select('contractor_id, expires_on').in('contractor_id', contractorIds).order('id').range(from, to))
    : contractorInsurancesRes;

  const loadError =
    actionsPage.error ?? legalObligationsPage.error ?? docsReviewDuePage.error ?? incidentsPage.error ??
    deploymentStatusPage.error ?? equipmentPage.error ?? auditFindingsPage.error ?? contractorsPage.error ??
    contractorInsurancesPage.error ?? environmentalPermitsPage.error ?? managementReviewsPage.error ??
    serviceRequestsPage.error ?? consultancyVisitsPage.error ?? null;

  const counts = computePortfolioCounts([companyId], new Date(), {
    actions: actionsPage.rows,
    legalObligations: legalObligationsPage.rows,
    documentsReviewDue: docsReviewDuePage.rows,
    incidents: incidentsPage.rows,
    deploymentStatus: deploymentStatusPage.rows,
    equipment: equipmentPage.rows,
    auditFindings: auditFindingsPage.rows,
    contractors: contractorsPage.rows,
    contractorInsurances: contractorInsurancesPage.rows,
    environmentalPermits: environmentalPermitsPage.rows,
    managementReviews: managementReviewsPage.rows,
    serviceRequests: serviceRequestsPage.rows,
    consultancyVisits: consultancyVisitsPage.rows,
  }).get(companyId)!;

  return { counts, loadError };
}
