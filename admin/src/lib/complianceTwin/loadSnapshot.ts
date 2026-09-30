import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';
import { computeHsKpis, type HsKpiIncident, type HsKpiActivity, type HsKpiAudit, type HsKpiEquipment } from '@/lib/hs/kpis';
import { computeGovernanceKpis } from '@/lib/governance/kpis';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';
import { analyzeIncidentPatterns, incidentPatternWindows, type IncidentRow, type IncidentCauseRow, type IncidentInvestigationRow } from '@/lib/incidentPatterns/analyze';
import { analyzeEvidenceCoverage, type RegisterCompletionRow, type ComplianceItemRow, type EvidenceFileRow } from '@/lib/evidenceEngine/analyze';
import { assembleComplianceTwin, type ComplianceTwinSnapshot } from './assemble';

const INCIDENT_PATTERN_WINDOW_DAYS = 90;

/**
 * Extracted from the admin Digital Twin page (Phase 12, Group 2) so
 * Phase 13's board-assurance "generate" action can call the EXACT same
 * assembly rather than a second, drifting copy — the "one calculation,
 * not two" rule this codebase holds to throughout (computeValueReport/
 * computeGovernanceMetrics were extracted for the identical reason: the
 * cron and the page must never disagree about the same company/period).
 * Admin-only (staff session reads only) — portal's own digital-twin
 * page keeps its separate, session-scoped version, since it differs in
 * more than just the company-id source (the legal_requirements lookup
 * needs the service role there, never here).
 */
export async function loadComplianceTwinSnapshot(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ snapshot: ComplianceTwinSnapshot; loadError: string | null }> {
  const today = new Date().toISOString().slice(0, 10);

  const [incidents12mo, activities, { data: audits }, equipment] = await Promise.all([
    readAllPages<HsKpiIncident>((from, to) =>
      supabase.from('hs_incidents').select('id, severity, riddor_reportable, occurred_on')
        .eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<HsKpiActivity>((from, to) =>
      supabase.from('hs_activities').select('id, activity_type, occurred_on')
        .eq('company_id', companyId).order('id').range(from, to)),
    supabase.from('hs_audits').select('score, conducted_on').eq('company_id', companyId).order('conducted_on', { ascending: false }).limit(2),
    readAllPages<HsKpiEquipment>((from, to) =>
      supabase.from('hs_equipment').select('id, status, next_inspection_due')
        .eq('company_id', companyId).order('id').range(from, to)),
  ]);

  const hsKpis = computeHsKpis({
    incidents: incidents12mo.rows, activities: activities.rows,
    audits: (audits ?? []) as HsKpiAudit[],
    equipment: equipment.rows, today,
  });

  const [wasteMovements, objectives, legalObligations, activeEmployeeCountRes] = await Promise.all([
    readAllPages<{ non_conformance: boolean; moved_at: string }>((from, to) =>
      supabase.from('waste_movements').select('id, non_conformance, moved_at')
        .eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ status: string }>((from, to) =>
      supabase.from('objectives').select('id, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ applicability_status: string; next_review_due: string | null }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('id, applicability_status, next_review_due')
        .eq('company_id', companyId).order('id').range(from, to)),
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

  const requirementIds = [...new Set(obligationsRaw.rows.map(o => o.legal_requirement_id))];
  const [{ data: requirements }, legalLinksA, legalLinksB] = await Promise.all([
    requirementIds.length > 0
      ? supabase.from('legal_requirements').select('id, title').in('id', requirementIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    readAllPages<RiskGraphLink>((from, to) =>
      supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', companyId).eq('from_type', 'legal_obligation').order('id').range(from, to)),
    readAllPages<RiskGraphLink>((from, to) =>
      supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', companyId).eq('to_type', 'legal_obligation').order('id').range(from, to)),
  ]);

  const titleByRequirement = new Map((requirements ?? []).map(r => [r.id, r.title]));
  const riskGraphLegalObligations = obligationsRaw.rows.map(o => ({
    id: o.id,
    title: titleByRequirement.get(o.legal_requirement_id) ?? 'Untitled requirement',
    applicability_status: o.applicability_status,
  }));
  const legalObligationLinks: RiskGraphLink[] = [...legalLinksA.rows, ...legalLinksB.rows];

  const riskGraph = computeRiskGraphIntelligence({
    hazards: hazards.rows,
    riskAssessments: riskAssessments.rows,
    riskAssessmentItems: raItems.rows,
    controlLinks: controlLinks.rows,
    legalObligations: riskGraphLegalObligations,
    legalObligationLinks,
  });

  const { windowStart, windowEndExclusive, priorStart, priorEndExclusive } =
    incidentPatternWindows(today, INCIDENT_PATTERN_WINDOW_DAYS);

  const [windowIncidents, priorIncidents, investigations, causes] = await Promise.all([
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', companyId).gte('occurred_on', windowStart).lt('occurred_on', windowEndExclusive).order('id').range(from, to)),
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', companyId).gte('occurred_on', priorStart).lt('occurred_on', priorEndExclusive).order('id').range(from, to)),
    readAllPages<IncidentInvestigationRow>((from, to) =>
      supabase.from('incident_investigations').select('id, incident_id').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<IncidentCauseRow>((from, to) =>
      supabase.from('incident_causes').select('id, investigation_id, cause_level, category, confirmed_at').eq('company_id', companyId).order('id').range(from, to)),
  ]);

  const incidentPatterns = analyzeIncidentPatterns({
    incidents: windowIncidents.rows,
    priorWindowIncidents: priorIncidents.rows,
    investigations: investigations.rows,
    causes: causes.rows,
  });

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

  const loadError =
    incidents12mo.error ?? activities.error ?? equipment.error ??
    wasteMovements.error ?? objectives.error ?? legalObligations.error ?? activeEmployeeCountRes.error?.message ??
    hazards.error ?? riskAssessments.error ?? raItems.error ?? controlLinks.error ?? obligationsRaw.error ??
    windowIncidents.error ?? priorIncidents.error ?? investigations.error ?? causes.error ??
    filesRes.error?.message ?? completionsRes.error?.message ?? itemsRes.error?.message ?? null;

  const snapshot = assembleComplianceTwin({
    hsKpis,
    governanceKpis,
    riskGraph,
    incidentPatterns,
    evidence,
  });

  return { snapshot, loadError };
}
