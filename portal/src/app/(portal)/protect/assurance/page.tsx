import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { readAllPages } from '@/lib/supabase/paged';
import { computeHsKpis, type HsKpiIncident, type HsKpiActivity, type HsKpiAudit, type HsKpiEquipment } from '@/lib/hs/kpis';
import { computeGovernanceKpis } from '@/lib/governance/kpis';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';
import { analyzeIncidentPatterns, incidentPatternWindows, type IncidentRow, type IncidentCauseRow, type IncidentInvestigationRow } from '@/lib/incidentPatterns/analyze';
import { analyzeEvidenceCoverage, type RegisterCompletionRow, type ComplianceItemRow, type EvidenceFileRow } from '@/lib/evidenceEngine/analyze';
import { assembleComplianceTwin } from '@/lib/complianceTwin/assemble';
import { computePortfolioCounts, type ActionRow, type LegalObligationRow, type PortfolioCountRow, type IncidentRow as PortfolioIncidentRow, type DeploymentStatusRow, type EquipmentRow, type AuditFindingRow } from '@/lib/health/portfolioCounts';
import { assembleAssuranceToday } from '@/lib/assurance/today';
import AssuranceTodayView from '@/components/hs/AssuranceTodayView';

export const metadata: Metadata = { title: 'Assurance Today' };
export const dynamic = 'force-dynamic';

const INCIDENT_PATTERN_WINDOW_DAYS = 90;

// Core-OS 360 Phase 18, Group 2. Read-only — nothing here is
// self-certified. The Digital Twin half of this page (everything down
// to `assembleComplianceTwin(...)`) is COPIED VERBATIM from
// /protect/digital-twin's own page — same reads, same five source
// modules, the identical "no new query shape invented" discipline —
// since admin and portal each run their own build with no shared
// server code, the shared-dupe file pattern only covers pure
// computation, never a page. The additional queries below it are new:
// PortfolioCounts' "right now" fields, scoped to this session's own
// company, reading only the tables and columns a client session can
// actually see (checked live against RLS before writing this: actions,
// organisation_legal_obligations, hs_documents, hs_incidents,
// person_deployment_status, hs_equipment and audit_findings all have a
// client-read policy; contractors/permits/isolations/consultancy_visits
// do not, so those fields are passed as empty arrays — they are not
// among the ones assembleAssuranceToday() ever reads, so this never
// under-reports anything the page actually shows).
export default async function ProtectAssurancePage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  const today = new Date().toISOString().slice(0, 10);

  // --- Safety (H&S KPIs) — identical reads to lib/hs/kpis.ts's own admin page. ---
  const [incidents12mo, activities, { data: audits }, equipment] = await Promise.all([
    readAllPages<HsKpiIncident>((from, to) =>
      supabase.from('hs_incidents').select('severity, riddor_reportable, occurred_on')
        .eq('company_id', companyId).range(from, to)),
    readAllPages<HsKpiActivity>((from, to) =>
      supabase.from('hs_activities').select('activity_type, occurred_on')
        .eq('company_id', companyId).range(from, to)),
    supabase.from('hs_audits').select('score, conducted_on').eq('company_id', companyId).order('conducted_on', { ascending: false }).limit(2),
    readAllPages<HsKpiEquipment>((from, to) =>
      supabase.from('hs_equipment').select('status, next_inspection_due')
        .eq('company_id', companyId).range(from, to)),
  ]);

  const hsKpis = computeHsKpis({
    incidents: incidents12mo.rows, activities: activities.rows,
    audits: (audits ?? []) as HsKpiAudit[],
    equipment: equipment.rows, today,
  });

  // --- Governance KPIs. ---
  const [wasteMovements, objectives, legalObligations, activeEmployeeCountRes] = await Promise.all([
    readAllPages<{ non_conformance: boolean; moved_at: string }>((from, to) =>
      supabase.from('waste_movements').select('non_conformance, moved_at')
        .eq('company_id', companyId).range(from, to)),
    readAllPages<{ status: string }>((from, to) =>
      supabase.from('objectives').select('status').eq('company_id', companyId).range(from, to)),
    readAllPages<{ applicability_status: string; next_review_due: string | null }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('applicability_status, next_review_due')
        .eq('company_id', companyId).range(from, to)),
    supabase.from('employee_records').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).or(`end_date.is.null,end_date.gt.${today}`),
  ]);

  const governanceKpis = computeGovernanceKpis({
    incidentsLast12MonthsCount: hsKpis.incidentsLast12Months,
    activeEmployeeCount: activeEmployeeCountRes.count ?? 0,
    wasteMovements: wasteMovements.rows,
    objectives: objectives.rows,
    legalObligations: legalObligations.rows,
    today,
  });

  // --- Risk Graph — identical reads to /protect/risk-graph's own page. ---
  const [hazards, riskAssessments, raItems, controlLinks, obligationsRaw] = await Promise.all([
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('hazards').select('id, title, status').eq('company_id', companyId).range(from, to)),
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('risk_assessments').select('id, title, status').eq('company_id', companyId).range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string; hazard_id: string | null }>((from, to) =>
      supabase.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id').eq('company_id', companyId).range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; control_title: string; effectiveness: string }>((from, to) =>
      supabase.from('risk_item_controls').select('risk_assessment_item_id, control_id, control_title, effectiveness').eq('company_id', companyId).range(from, to)),
    readAllPages<{ id: string; legal_requirement_id: string; applicability_status: string }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('id, legal_requirement_id, applicability_status').eq('company_id', companyId).range(from, to)),
  ]);

  const requirementIds = [...new Set(obligationsRaw.rows.map(o => o.legal_requirement_id))];
  let titleByRequirement = new Map<string, string>();
  if (requirementIds.length > 0) {
    const svc = createServiceSupabaseClient();
    const { data: requirements } = await svc.from('legal_requirements').select('id, title').in('id', requirementIds);
    titleByRequirement = new Map((requirements ?? []).map(r => [r.id, r.title]));
  }
  const riskGraphLegalObligations = obligationsRaw.rows.map(o => ({
    id: o.id,
    title: titleByRequirement.get(o.legal_requirement_id) ?? 'A legal requirement',
    applicability_status: o.applicability_status,
  }));

  const obligationIds = obligationsRaw.rows.map(o => o.id);
  let legalObligationLinks: RiskGraphLink[] = [];
  if (obligationIds.length > 0) {
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from('hs_links').select('from_type, from_id, to_type, to_id').eq('from_type', 'legal_obligation').in('from_id', obligationIds),
      supabase.from('hs_links').select('from_type, from_id, to_type, to_id').eq('to_type', 'legal_obligation').in('to_id', obligationIds),
    ]);
    legalObligationLinks = [...(a ?? []), ...(b ?? [])];
  }

  const riskGraph = computeRiskGraphIntelligence({
    hazards: hazards.rows,
    riskAssessments: riskAssessments.rows,
    riskAssessmentItems: raItems.rows,
    controlLinks: controlLinks.rows,
    legalObligations: riskGraphLegalObligations,
    legalObligationLinks,
  });

  // --- Incident Patterns — identical reads to /protect/incident-patterns's own page, at its 90-day default. ---
  const { windowStart, windowEndExclusive, priorStart, priorEndExclusive } =
    incidentPatternWindows(today, INCIDENT_PATTERN_WINDOW_DAYS);

  const [windowIncidents, priorIncidents, investigations, causes] = await Promise.all([
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', companyId).gte('occurred_on', windowStart).lt('occurred_on', windowEndExclusive).range(from, to)),
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', companyId).gte('occurred_on', priorStart).lt('occurred_on', priorEndExclusive).range(from, to)),
    readAllPages<IncidentInvestigationRow>((from, to) =>
      supabase.from('incident_investigations').select('id, incident_id').eq('company_id', companyId).range(from, to)),
    readAllPages<IncidentCauseRow>((from, to) =>
      supabase.from('incident_causes').select('investigation_id, cause_level, category, confirmed_at').eq('company_id', companyId).range(from, to)),
  ]);

  const incidentPatterns = analyzeIncidentPatterns({
    incidents: windowIncidents.rows,
    priorWindowIncidents: priorIncidents.rows,
    investigations: investigations.rows,
    causes: causes.rows,
  });

  // --- Evidence Coverage — identical reads to /protect/evidence's own page. ---
  const [filesRes, completionsRes, itemsRes] = await Promise.all([
    supabase.from('hs_files').select('id, entity_type, entity_id, file_name, size_bytes, created_at, storage_path')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
    supabase.from('hs_register_completions').select('id, item_id, outcome, completed_on')
      .eq('company_id', companyId).order('completed_on', { ascending: false }).limit(500),
    supabase.from('compliance_items').select('id, title, category').eq('company_id', companyId).limit(500),
  ]);

  const evidence = analyzeEvidenceCoverage({
    completions: (completionsRes.data ?? []) as RegisterCompletionRow[],
    items: (itemsRes.data ?? []) as ComplianceItemRow[],
    files: (filesRes.data ?? []) as EvidenceFileRow[],
  });

  const twin = assembleComplianceTwin({ hsKpis, governanceKpis, riskGraph, incidentPatterns, evidence });

  // --- Phase 18: the "right now" PortfolioCounts fields this page
  // actually surfaces. Deliberately separate, narrowly-shaped reads
  // from the ones above (which select different columns for their own
  // purposes) — never reused across the two, to keep each read's shape
  // exactly what its own consumer needs.
  const [actionsPage, legalObligationsForCountsPage, docsReviewDuePage, incidentsForCountsPage, deploymentStatusPage, equipmentForCountsPage, auditFindingsPage] = await Promise.all([
    readAllPages<ActionRow>((from, to) =>
      supabase.from('actions').select('company_id, status, severity').eq('company_id', companyId).range(from, to)),
    readAllPages<LegalObligationRow>((from, to) =>
      supabase.from('organisation_legal_obligations').select('company_id, applicability_status, next_review_due').eq('company_id', companyId).range(from, to)),
    readAllPages<PortfolioCountRow>((from, to) =>
      supabase.from('hs_documents').select('company_id').eq('company_id', companyId).eq('status', 'review_due').range(from, to)),
    readAllPages<PortfolioIncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('company_id, status, severity').eq('company_id', companyId).range(from, to)),
    readAllPages<DeploymentStatusRow>((from, to) =>
      supabase.from('person_deployment_status').select('company_id, status, result').eq('company_id', companyId).range(from, to)),
    readAllPages<EquipmentRow>((from, to) =>
      supabase.from('hs_equipment').select('company_id, status').eq('company_id', companyId).range(from, to)),
    readAllPages<AuditFindingRow>((from, to) =>
      supabase.from('audit_findings').select('company_id, severity, closed_at').eq('company_id', companyId).range(from, to)),
  ]);

  const counts = computePortfolioCounts([companyId], new Date(), {
    actions: actionsPage.rows,
    legalObligations: legalObligationsForCountsPage.rows,
    documentsReviewDue: docsReviewDuePage.rows,
    incidents: incidentsForCountsPage.rows,
    deploymentStatus: deploymentStatusPage.rows,
    equipment: equipmentForCountsPage.rows,
    auditFindings: auditFindingsPage.rows,
    contractors: [], contractorInsurances: [], environmentalPermits: [], managementReviews: [], serviceRequests: [], consultancyVisits: [],
  }).get(companyId)!;

  const loadError =
    incidents12mo.error ?? activities.error ?? equipment.error ??
    wasteMovements.error ?? objectives.error ?? legalObligations.error ?? activeEmployeeCountRes.error?.message ??
    hazards.error ?? riskAssessments.error ?? raItems.error ?? controlLinks.error ?? obligationsRaw.error ??
    windowIncidents.error ?? priorIncidents.error ?? investigations.error ?? causes.error ??
    filesRes.error?.message ?? completionsRes.error?.message ?? itemsRes.error?.message ??
    actionsPage.error ?? legalObligationsForCountsPage.error ?? docsReviewDuePage.error ??
    incidentsForCountsPage.error ?? deploymentStatusPage.error ?? equipmentForCountsPage.error ?? auditFindingsPage.error ?? null;

  const snapshot = assembleAssuranceToday(counts, twin, new Date());

  return (
    <main className="portal-page flex-1">
      <AssuranceTodayView
        snapshot={snapshot}
        loadError={loadError}
        twinLinks={{
          safety: '/protect/incidents',
          governance: '/protect/legal-register',
          risk_graph: '/protect/risk-graph',
          incident_patterns: '/protect/incident-patterns',
          evidence: '/protect/evidence',
        }}
      />
    </main>
  );
}
