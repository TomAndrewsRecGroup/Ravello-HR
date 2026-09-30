import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import {
  computePortfolioCounts,
  type ActionRow, type LegalObligationRow, type PortfolioCountRow, type IncidentRow as PortfolioIncidentRow,
  type DeploymentStatusRow, type EquipmentRow, type AuditFindingRow, type ContractorRow, type ContractorInsuranceRow,
  type EnvironmentalPermitRow, type ManagementReviewRow, type ServiceRequestRow, type ConsultancyVisitRow,
} from '@/lib/health/portfolioCounts';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';
import { assembleCore360Status, type TrainingRecordExpiryRow, type EnvironmentalSpillStatusRow, type WasteMovementConformanceRow } from '@/lib/core360Status/assemble';
import Core360StatusView from '@/components/hs/Core360StatusView';

export const metadata: Metadata = { title: 'Core 360 Status' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Completion Programme, Phase 27, Group 4 (closes C13.8).
// Read-only — nothing here is self-certified, the standing PROTECT
// posture. The PortfolioCounts reads below are COPIED from admin's own
// loadPortfolioCounts.ts (Phase 13), scoped to this session's own
// company under the client's own RLS — checked live against every
// table's actual policy text before writing this, NOT assumed from
// the older Phase 18 Assurance Today page's own (now-stale) "contractors/
// permits/isolations/consultancy_visits do not [have a client-read
// policy]" comment: contractors_manage/contractor_insurances_manage
// (150) and consultancy_visits_client_read (168) already grant a plain
// client session read access to their own company's rows, and
// environmental_permits/management_reviews/service_requests each
// already have their own real portal pages reading them directly.
// Permits and isolations genuinely have no client-read policy (Phase
// 22's own finding) and PortfolioCounts never reads either table
// anyway, so nothing here is affected by that gap.
export default async function ProtectCore360StatusPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  const today = new Date();

  const [
    actionsPage, legalObligationsPage, docsReviewDuePage, incidentsPage,
    deploymentStatusPage, equipmentPage, auditFindingsPage, contractorsPage,
    environmentalPermitsPage, managementReviewsPage, serviceRequestsPage, consultancyVisitsPage,
  ] = await Promise.all([
    readAllPages<ActionRow>((from, to) =>
      supabase.from('actions').select('company_id, status, severity').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<LegalObligationRow>((from, to) =>
      supabase.from('organisation_legal_obligations').select('company_id, applicability_status, next_review_due').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<PortfolioCountRow>((from, to) =>
      supabase.from('hs_documents').select('company_id').eq('company_id', companyId).eq('status', 'review_due').order('id').range(from, to)),
    readAllPages<PortfolioIncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('company_id, status, severity').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<DeploymentStatusRow>((from, to) =>
      supabase.from('person_deployment_status').select('company_id, status, result').eq('company_id', companyId).order('person_id').range(from, to)),
    readAllPages<EquipmentRow>((from, to) =>
      supabase.from('hs_equipment').select('company_id, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<AuditFindingRow>((from, to) =>
      supabase.from('audit_findings').select('company_id, severity, closed_at').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<ContractorRow>((from, to) =>
      supabase.from('contractors').select('id, company_id, approval_status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<EnvironmentalPermitRow>((from, to) =>
      supabase.from('environmental_permits').select('company_id, status, expires_on').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<ManagementReviewRow>((from, to) =>
      supabase.from('management_reviews').select('company_id, status, review_date').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<ServiceRequestRow>((from, to) =>
      supabase.from('service_requests').select('company_id, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<ConsultancyVisitRow>((from, to) =>
      supabase.from('consultancy_visits').select('client_organisation_id, status, scheduled_date').eq('client_organisation_id', companyId).order('id').range(from, to)),
  ]);

  const contractorIds = contractorsPage.rows.map(c => c.id);
  const contractorInsurancesPage = contractorIds.length > 0
    ? await readAllPages<ContractorInsuranceRow>((from, to) =>
        supabase.from('contractor_insurances').select('contractor_id, expires_on').in('contractor_id', contractorIds).order('id').range(from, to))
    : { rows: [] as ContractorInsuranceRow[], error: null as string | null };

  const counts = computePortfolioCounts([companyId], today, {
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

  // --- Risk Graph — identical reads to /protect/risk-graph's own page. ---
  const [hazards, riskAssessments, raItems, controlLinks, obligationsRaw] = await Promise.all([
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('hazards').select('id, title, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('risk_assessments').select('id, title, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string; hazard_id: string | null }>((from, to) =>
      supabase.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; control_title: string; effectiveness: string }>((from, to) =>
      supabase.from('risk_item_controls').select('id, risk_assessment_item_id, control_id, control_title, effectiveness').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ id: string; legal_requirement_id: string; applicability_status: string }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('id, legal_requirement_id, applicability_status').eq('company_id', companyId).order('id').range(from, to)),
  ]);

  const [a, b] = await Promise.all([
    readAllPages<RiskGraphLink>((from, to) =>
      supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', companyId).eq('from_type', 'legal_obligation').order('id').range(from, to)),
    readAllPages<RiskGraphLink>((from, to) =>
      supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', companyId).eq('to_type', 'legal_obligation').order('id').range(from, to)),
  ]);

  // Titles aren't needed for the domain-level counts this page renders
  // (uncoveredHazards.length / ineffectiveSharedControls.length only)
  // — never fetched with the service role here for that reason.
  const riskGraphLegalObligations = obligationsRaw.rows.map(o => ({
    id: o.id,
    title: 'A legal requirement',
    applicability_status: o.applicability_status,
  }));

  const riskGraph = computeRiskGraphIntelligence({
    hazards: hazards.rows,
    riskAssessments: riskAssessments.rows,
    riskAssessmentItems: raItems.rows,
    controlLinks: controlLinks.rows,
    legalObligations: riskGraphLegalObligations,
    legalObligationLinks: [...a.rows, ...b.rows],
  });

  // --- The two genuinely new counts. ---
  const [trainingRows, spillRows, wasteRows] = await Promise.all([
    readAllPages<TrainingRecordExpiryRow>((from, to) =>
      supabase.from('training_records').select('id, expires_on').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<EnvironmentalSpillStatusRow>((from, to) =>
      supabase.from('environmental_spills').select('id, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<WasteMovementConformanceRow>((from, to) =>
      supabase.from('waste_movements').select('id, non_conformance').eq('company_id', companyId).order('id').range(from, to)),
  ]);

  const loadError =
    actionsPage.error ?? legalObligationsPage.error ?? docsReviewDuePage.error ?? incidentsPage.error ??
    deploymentStatusPage.error ?? equipmentPage.error ?? auditFindingsPage.error ?? contractorsPage.error ??
    contractorInsurancesPage.error ?? environmentalPermitsPage.error ?? managementReviewsPage.error ??
    serviceRequestsPage.error ?? consultancyVisitsPage.error ??
    hazards.error ?? riskAssessments.error ?? raItems.error ?? controlLinks.error ?? obligationsRaw.error ??
    a.error ?? b.error ?? trainingRows.error ?? spillRows.error ?? wasteRows.error ?? null;

  const snapshot = assembleCore360Status({
    portfolioCounts: counts,
    riskGraph,
    trainingRows: trainingRows.rows,
    environmentalSpills: spillRows.rows,
    wasteMovements: wasteRows.rows,
    today,
  });

  return (
    <main className="portal-page flex-1">
      <Core360StatusView
        snapshot={snapshot}
        loadError={loadError}
        links={{
          people: '/lead/workforce',
          plant: '/protect/equipment',
          training: '/lead/training-records',
          risk_controls: '/protect/risk-graph',
          environmental: '/protect/environmental-spills',
          contractors: '/protect/contractors',
        }}
      />
    </main>
  );
}
