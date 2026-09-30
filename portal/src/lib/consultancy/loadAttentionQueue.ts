import { readAllPages } from '@/lib/supabase/paged';
import { createServiceSupabaseClient, portfolioOrgIds, type PortfolioSession } from './portfolioAccess';
import { buildAttentionQueue, type AttentionQueueItem } from './attentionQueue';

/** Shared by the /consultancy/attention-queue page and its API route so
 *  the two can never disagree about what the queue contains. */
export async function loadAttentionQueue(portfolio: PortfolioSession): Promise<AttentionQueueItem[]> {
  const orgIds = portfolioOrgIds(portfolio.organisations);
  if (orgIds.length === 0) return [];

  const sb = createServiceSupabaseClient();
  const [
    actions, legalObligations, documentsReviewDue, incidents, deploymentStatus,
    equipment, auditFindings, contractors, contractorInsurances, environmentalPermits,
    managementReviews, serviceRequests, permits, isolations, environmentalMonitoring, sites,
  ] = await Promise.all([
    readAllPages<any>((from, to) => sb.from('actions').select('id, company_id, status, severity, title, due_date, assigned_to').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('organisation_legal_obligations').select('id, company_id, applicability_status, next_review_due, legal_requirement_id').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('hs_documents').select('id, company_id, title, review_due_at').eq('status', 'review_due').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('hs_incidents').select('id, company_id, status, severity, incident_type, incident_number').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('person_deployment_status').select('person_id, company_id, status, result').in('company_id', orgIds).order('person_id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('hs_equipment').select('id, company_id, status, name, site_id').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('audit_findings').select('id, company_id, severity, closed_at, created_at, hs_audit_response_id').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('contractors').select('id, company_id, approval_status, name').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('contractor_insurances').select('id, contractor_id, expires_on, insurance_type').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('environmental_permits').select('id, company_id, status, expires_on, permit_type').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('management_reviews').select('id, company_id, status, review_date').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('service_requests').select('id, company_id, status, subject, priority, created_at').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('permits').select('id, company_id, status, permit_number, site_id, valid_until').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('isolations').select('id, company_id, status, asset_id, isolation_type, applied_at').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('environmental_monitoring').select('id, company_id, site_id, parameter, within_limit, recorded_at').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('hs_sites').select('id, name').in('company_id', orgIds).order('id').range(from, to)),
  ]);

  const personIds = [...new Set(deploymentStatus.rows.map((d: any) => d.person_id))];
  const { data: peopleRows } = personIds.length
    ? await sb.from('people').select('id, full_name').in('id', personIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameByPerson = new Map((peopleRows ?? []).map((p: any) => [p.id, p.full_name]));

  const orgNames = new Map(portfolio.organisations.map(o => [o.organisation_id, o.name]));
  const siteNames = new Map(sites.rows.map((s: any) => [s.id, s.name]));

  return buildAttentionQueue({
    orgNames, siteNames, today: new Date(),
    actions: actions.rows, legalObligations: legalObligations.rows, documentsReviewDue: documentsReviewDue.rows,
    incidents: incidents.rows,
    deploymentStatus: deploymentStatus.rows.map((d: any) => ({ ...d, full_name: nameByPerson.get(d.person_id) ?? null })),
    equipment: equipment.rows, auditFindings: auditFindings.rows, contractors: contractors.rows,
    contractorInsurances: contractorInsurances.rows, environmentalPermits: environmentalPermits.rows,
    managementReviews: managementReviews.rows, serviceRequests: serviceRequests.rows,
    permits: permits.rows, isolations: isolations.rows, environmentalMonitoring: environmentalMonitoring.rows,
  });
}
