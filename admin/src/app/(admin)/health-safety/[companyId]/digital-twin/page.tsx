import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { computeHsKpis, type HsKpiIncident, type HsKpiActivity, type HsKpiAudit, type HsKpiEquipment } from '@/lib/hs/kpis';
import { computeGovernanceKpis } from '@/lib/governance/kpis';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';
import { analyzeIncidentPatterns, incidentPatternWindows, type IncidentRow, type IncidentCauseRow, type IncidentInvestigationRow } from '@/lib/incidentPatterns/analyze';
import { analyzeEvidenceCoverage, type RegisterCompletionRow, type ComplianceItemRow, type EvidenceFileRow } from '@/lib/evidenceEngine/analyze';
import { assembleComplianceTwin } from '@/lib/complianceTwin/assemble';
import ComplianceTwinView from '@/components/hs/ComplianceTwinView';

export const metadata: Metadata = { title: 'Digital Twin' };
export const dynamic = 'force-dynamic';

const INCIDENT_PATTERN_WINDOW_DAYS = 90;

// Core-OS 360 Phase 12, Group 2. Assembles the client's Compliance
// Digital Twin (lib/complianceTwin/assemble.ts, Group 1) by reading
// EXACTLY the same rows each of the five source pages already reads —
// no new query shape invented — then combining their outputs into one
// snapshot. See each block's comment for which existing page its reads
// are copied from.
export default async function DigitalTwinPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  // --- Safety (H&S KPIs) — identical reads to kpis/page.tsx ---
  const [incidents12mo, activities, { data: audits }, equipment] = await Promise.all([
    readAllPages<HsKpiIncident>((from, to) =>
      supabase.from('hs_incidents').select('severity, riddor_reportable, occurred_on')
        .eq('company_id', params.companyId).range(from, to)),
    readAllPages<HsKpiActivity>((from, to) =>
      supabase.from('hs_activities').select('activity_type, occurred_on')
        .eq('company_id', params.companyId).range(from, to)),
    supabase.from('hs_audits').select('score, conducted_on').eq('company_id', params.companyId).order('conducted_on', { ascending: false }).limit(2),
    readAllPages<HsKpiEquipment>((from, to) =>
      supabase.from('hs_equipment').select('status, next_inspection_due')
        .eq('company_id', params.companyId).range(from, to)),
  ]);

  const hsKpis = computeHsKpis({
    incidents: incidents12mo.rows, activities: activities.rows,
    audits: (audits ?? []) as HsKpiAudit[],
    equipment: equipment.rows, today,
  });

  // --- Governance KPIs. computeGovernanceKpis has never had a caller
  // anywhere in this codebase before this page (checked before writing
  // this — it shipped in Phase 5 Group 8 with only its own unit test),
  // so these reads are written fresh from its own documented
  // GovernanceKpiInput/DATA_SOURCE strings, not copied from a prior
  // page. incidentsLast12MonthsCount reuses hsKpis.incidentsLast12Months
  // rather than a second hs_incidents read — the exact same fact
  // ("any hs_incidents row in the trailing 12 months"), computed once. ---
  const [wasteMovements, objectives, legalObligations, activeEmployeeCountRes] = await Promise.all([
    readAllPages<{ non_conformance: boolean; moved_at: string }>((from, to) =>
      supabase.from('waste_movements').select('non_conformance, moved_at')
        .eq('company_id', params.companyId).range(from, to)),
    readAllPages<{ status: string }>((from, to) =>
      supabase.from('objectives').select('status').eq('company_id', params.companyId).range(from, to)),
    readAllPages<{ applicability_status: string; next_review_due: string | null }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('applicability_status, next_review_due')
        .eq('company_id', params.companyId).range(from, to)),
    supabase.from('employee_records').select('id', { count: 'exact', head: true })
      .eq('company_id', params.companyId).or(`end_date.is.null,end_date.gt.${today}`),
  ]);

  const governanceKpis = computeGovernanceKpis({
    incidentsLast12MonthsCount: hsKpis.incidentsLast12Months,
    activeEmployeeCount: activeEmployeeCountRes.count ?? 0,
    wasteMovements: wasteMovements.rows,
    objectives: objectives.rows,
    legalObligations: legalObligations.rows,
    today,
  });

  // --- Risk Graph — identical reads to risk-graph/page.tsx, minus the
  // explore-panel options this page has no equivalent panel for. ---
  const [hazards, riskAssessments, raItems, controlLinks, obligationsRaw] = await Promise.all([
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('hazards').select('id, title, status').eq('company_id', params.companyId).range(from, to)),
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('risk_assessments').select('id, title, status').eq('company_id', params.companyId).range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string; hazard_id: string | null }>((from, to) =>
      supabase.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id').eq('company_id', params.companyId).range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; control_title: string; effectiveness: string }>((from, to) =>
      supabase.from('risk_item_controls').select('risk_assessment_item_id, control_id, control_title, effectiveness').eq('company_id', params.companyId).range(from, to)),
    readAllPages<{ id: string; legal_requirement_id: string; applicability_status: string }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('id, legal_requirement_id, applicability_status').eq('company_id', params.companyId).range(from, to)),
  ]);

  const requirementIds = [...new Set(obligationsRaw.rows.map(o => o.legal_requirement_id))];
  const [{ data: requirements }, { data: legalLinksA }, { data: legalLinksB }] = await Promise.all([
    requirementIds.length > 0
      ? supabase.from('legal_requirements').select('id, title').in('id', requirementIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    supabase.from('hs_links').select('from_type, from_id, to_type, to_id').eq('company_id', params.companyId).eq('from_type', 'legal_obligation'),
    supabase.from('hs_links').select('from_type, from_id, to_type, to_id').eq('company_id', params.companyId).eq('to_type', 'legal_obligation'),
  ]);

  const titleByRequirement = new Map((requirements ?? []).map(r => [r.id, r.title]));
  const riskGraphLegalObligations = obligationsRaw.rows.map(o => ({
    id: o.id,
    title: titleByRequirement.get(o.legal_requirement_id) ?? 'Untitled requirement',
    applicability_status: o.applicability_status,
  }));
  const legalObligationLinks: RiskGraphLink[] = [...(legalLinksA ?? []), ...(legalLinksB ?? [])];

  const riskGraph = computeRiskGraphIntelligence({
    hazards: hazards.rows,
    riskAssessments: riskAssessments.rows,
    riskAssessmentItems: raItems.rows,
    controlLinks: controlLinks.rows,
    legalObligations: riskGraphLegalObligations,
    legalObligationLinks,
  });

  // --- Incident Patterns — identical reads to incident-patterns/page.tsx,
  // at the same 90-day default the standalone page opens on. ---
  const { windowStart, windowEndExclusive, priorStart, priorEndExclusive } =
    incidentPatternWindows(today, INCIDENT_PATTERN_WINDOW_DAYS);

  const [windowIncidents, priorIncidents, investigations, causes] = await Promise.all([
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', params.companyId).gte('occurred_on', windowStart).lt('occurred_on', windowEndExclusive).range(from, to)),
    readAllPages<IncidentRow>((from, to) =>
      supabase.from('hs_incidents').select('id, incident_type, severity, site_id, department_id, occurred_on')
        .eq('company_id', params.companyId).gte('occurred_on', priorStart).lt('occurred_on', priorEndExclusive).range(from, to)),
    readAllPages<IncidentInvestigationRow>((from, to) =>
      supabase.from('incident_investigations').select('id, incident_id').eq('company_id', params.companyId).range(from, to)),
    readAllPages<IncidentCauseRow>((from, to) =>
      supabase.from('incident_causes').select('investigation_id, cause_level, category, confirmed_at').eq('company_id', params.companyId).range(from, to)),
  ]);

  const incidentPatterns = analyzeIncidentPatterns({
    incidents: windowIncidents.rows,
    priorWindowIncidents: priorIncidents.rows,
    investigations: investigations.rows,
    causes: causes.rows,
  });

  // --- Evidence Coverage — identical reads to evidence/page.tsx. ---
  const [filesRes, completionsRes, itemsRes] = await Promise.all([
    supabase.from('hs_files').select('id, entity_type, entity_id, file_name, size_bytes, created_at, storage_path')
      .eq('company_id', params.companyId).order('created_at', { ascending: false }).limit(200),
    supabase.from('hs_register_completions').select('id, item_id, outcome, completed_on')
      .eq('company_id', params.companyId).order('completed_on', { ascending: false }).limit(500),
    supabase.from('compliance_items').select('id, title, category').eq('company_id', params.companyId).limit(500),
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

  const base = `/health-safety/${params.companyId}`;
  return (
    <ComplianceTwinView
      snapshot={snapshot}
      loadError={loadError}
      links={{
        safety: `${base}/kpis`,
        governance: `${base}/legal`,
        risk_graph: `${base}/risk-graph`,
        incident_patterns: `${base}/incident-patterns`,
        evidence: `${base}/evidence`,
      }}
    />
  );
}
