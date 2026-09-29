import { readAllPages } from '@/lib/supabase/paged';
import { createServiceSupabaseClient, portfolioOrgIds, type PortfolioSession } from './portfolioAccess';
import { buildPortfolioCalendar, type PortfolioCalendarEvent } from './portfolioCalendar';

/** Shared by the /consultancy/calendar page and any future API route. */
export async function loadPortfolioCalendar(portfolio: PortfolioSession): Promise<PortfolioCalendarEvent[]> {
  const orgIds = portfolioOrgIds(portfolio.organisations);
  if (orgIds.length === 0) return [];

  const sb = createServiceSupabaseClient();
  const [
    visits, auditProgrammes, legalObligations, managementReviews, trainingExpiring,
    documentsReview, milestones, environmentalPermits, contractorInsurances, isoCertifications,
  ] = await Promise.all([
    readAllPages<any>((from, to) => sb.from('consultancy_visits').select('id, client_organisation_id, scheduled_date, visit_type, status').in('client_organisation_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('audit_programmes').select('id, company_id, name, next_due_date, active').eq('active', true).in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('organisation_legal_obligations').select('id, company_id, next_review_due, applicability_status').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('management_reviews').select('id, company_id, review_date, status').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('training_records').select('id, company_id, course_name, expires_on').not('expires_on', 'is', null).in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('hs_documents').select('id, company_id, title, review_due_at, status').eq('status', 'active').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('milestones').select('id, company_id, title, due_date').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('environmental_permits').select('id, company_id, permit_type, expires_on, status').eq('status', 'active').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('contractor_insurances').select('id, company_id, insurance_type, expires_on').in('company_id', orgIds).order('id').range(from, to)),
    readAllPages<any>((from, to) => sb.from('iso_certifications').select('id, company_id, certificate_number, expires_on').in('company_id', orgIds).order('id').range(from, to)),
  ]);

  const orgNames = new Map(portfolio.organisations.map(o => [o.organisation_id, o.name]));

  return buildPortfolioCalendar({
    orgNames,
    visits: visits.rows, auditProgrammes: auditProgrammes.rows, legalObligations: legalObligations.rows,
    managementReviews: managementReviews.rows, trainingExpiring: trainingExpiring.rows,
    documentsReview: documentsReview.rows, milestones: milestones.rows,
    environmentalPermits: environmentalPermits.rows, contractorInsurances: contractorInsurances.rows,
    isoCertifications: isoCertifications.rows,
  });
}
