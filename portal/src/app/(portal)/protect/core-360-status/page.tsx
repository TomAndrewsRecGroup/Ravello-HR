import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { readAllPages } from '@/lib/supabase/paged';
import {
  computePortfolioCounts,
  type ActionRow, type LegalObligationRow, type PortfolioCountRow, type IncidentRow as PortfolioIncidentRow,
  type DeploymentStatusRow, type EquipmentRow, type AuditFindingRow, type ContractorRow, type ContractorInsuranceRow,
  type EnvironmentalPermitRow, type ManagementReviewRow, type ServiceRequestRow, type ConsultancyVisitRow,
} from '@/lib/health/portfolioCounts';
import { computeHsKpis, type HsKpiIncident, type HsKpiActivity, type HsKpiAudit, type HsKpiEquipment } from '@/lib/hs/kpis';
import { computeGovernanceKpis } from '@/lib/governance/kpis';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';
import { analyzeIncidentPatterns, incidentPatternWindows, type IncidentRow, type IncidentCauseRow, type IncidentInvestigationRow } from '@/lib/incidentPatterns/analyze';
import { analyzeEvidenceCoverage, type RegisterCompletionRow, type ComplianceItemRow, type EvidenceFileRow } from '@/lib/evidenceEngine/analyze';
import { assembleComplianceTwin, type ComplianceTwinThresholds } from '@/lib/complianceTwin/assemble';
import { assembleAssuranceToday } from '@/lib/assurance/today';
import { assembleCore360Status, type TrainingRecordExpiryRow, type EnvironmentalSpillStatusRow, type WasteMovementConformanceRow } from '@/lib/core360Status/assemble';
import Core360StatusView from '@/components/hs/Core360StatusView';
import AssuranceTodayView from '@/components/hs/AssuranceTodayView';
import BoardAssuranceAcknowledge from './BoardAssuranceAcknowledge';
import type { BoardAssuranceReportData } from './boardAssuranceTypes';

export const metadata: Metadata = { title: 'Core 360 Status' };
export const dynamic = 'force-dynamic';

const INCIDENT_PATTERN_WINDOW_DAYS = 90;

const BAND_LABEL: Record<string, string> = { red: 'Needs attention', amber: 'Worth a look', green: 'On track' };
const BAND_COLOUR: Record<string, string> = { red: 'var(--red)', amber: 'var(--gold)', green: 'var(--teal)' };
const TREND_LABEL: Record<string, string> = { improved: 'Improved', declined: 'Declined', unchanged: 'Unchanged' };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

interface BoardReportRow {
  id: string;
  year: number;
  quarter: number;
  issued_at: string | null;
  report_data: BoardAssuranceReportData;
}
interface AckRow {
  report_id: string;
  acknowledged_by_name: string;
  comment: string | null;
  acknowledged_at: string;
}

// Go-live gap list, item 3 (2026-10-02): "keep only one" dashboard —
// this page is now that one. It used to be four separate pages
// (Digital Twin, Assurance Today, Board Assurance, Core 360 Status
// itself), each answering some version of "is this client OK" with no
// cross-link between them. All four are now sections on ONE page.
// Read-only throughout except the Board Assurance acknowledgement
// action — nothing here is self-certified, the standing PROTECT
// posture. Every read is copied from its own original standalone page
// (same five source modules for the Twin, same PortfolioCounts shape
// for Core 360 Status/Assurance Today, same board_assurance_reports
// read for Board Assurance) — the one deliberate de-duplication is
// riskGraph, computed ONCE and reused for both Core 360 Status's own
// Risk Controls domain and the Twin's Risk Graph area, since the two
// need the identical RiskGraphIntelligence value.
//
// Go-live gap list, item 7 (2026-10-02): the Twin's thresholds were
// never read on the portal side, so a client whose admin set a
// threshold override always saw the plain documented defaults
// regardless. Closed by migration 208's new client-read policy on
// compliance_twin_thresholds (company-scoped, risk.read-gated, the
// exact board_assurance_reports_client_read precedent) — read below
// and passed through to assembleComplianceTwin() exactly as admin's
// own loadComplianceTwinSnapshot() already does.
export default async function ProtectCore360StatusPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // --- PortfolioCounts (the FULL shape, including contractors/permits/
  // environmental permits/management reviews/service requests/
  // consultancy visits — unlike the old standalone Assurance Today
  // page, which passed these as empty arrays). Feeds BOTH Core 360
  // Status's six domains and Assurance Today's "flagged today" list. ---
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

  // --- Risk Graph — computed ONCE, reused for Core 360 Status's own
  // Risk Controls domain AND the Compliance Twin's Risk Graph area. ---
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
    const [a, b] = await Promise.all([
      readAllPages<RiskGraphLink>((from, to) =>
        supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
          .eq('from_type', 'legal_obligation').in('from_id', obligationIds).order('id').range(from, to)),
      readAllPages<RiskGraphLink>((from, to) =>
        supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
          .eq('to_type', 'legal_obligation').in('to_id', obligationIds).order('id').range(from, to)),
    ]);
    legalObligationLinks = [...a.rows, ...b.rows];
  }

  const riskGraph = computeRiskGraphIntelligence({
    hazards: hazards.rows,
    riskAssessments: riskAssessments.rows,
    riskAssessmentItems: raItems.rows,
    controlLinks: controlLinks.rows,
    legalObligations: riskGraphLegalObligations,
    legalObligationLinks,
  });

  // --- Core 360 Status's two genuinely new counts. ---
  const [trainingRows, spillRows, wasteRows] = await Promise.all([
    readAllPages<TrainingRecordExpiryRow>((from, to) =>
      supabase.from('training_records').select('id, expires_on').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<EnvironmentalSpillStatusRow>((from, to) =>
      supabase.from('environmental_spills').select('id, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<WasteMovementConformanceRow>((from, to) =>
      supabase.from('waste_movements').select('id, non_conformance').eq('company_id', companyId).order('id').range(from, to)),
  ]);

  const core360Snapshot = assembleCore360Status({
    portfolioCounts: counts,
    riskGraph,
    trainingRows: trainingRows.rows,
    environmentalSpills: spillRows.rows,
    wasteMovements: wasteRows.rows,
    today,
  });

  // --- The Compliance Digital Twin's other four areas — identical
  // reads to the old standalone /protect/digital-twin page. ---
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
    equipment: equipment.rows, today: todayIso,
  });

  const [wasteMovementsForGov, objectives, activeEmployeeCountRes] = await Promise.all([
    readAllPages<{ non_conformance: boolean; moved_at: string }>((from, to) =>
      supabase.from('waste_movements').select('id, non_conformance, moved_at')
        .eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ status: string }>((from, to) =>
      supabase.from('objectives').select('id, status').eq('company_id', companyId).order('id').range(from, to)),
    supabase.from('employee_records').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).or(`end_date.is.null,end_date.gt.${todayIso}`),
  ]);

  const governanceKpis = computeGovernanceKpis({
    incidentsLast12MonthsCount: hsKpis.incidentsLast12Months,
    activeEmployeeCount: activeEmployeeCountRes.count ?? 0,
    wasteMovements: wasteMovementsForGov.rows,
    objectives: objectives.rows,
    legalObligations: legalObligationsPage.rows,
    today: todayIso,
  });

  const { windowStart, windowEndExclusive, priorStart, priorEndExclusive } =
    incidentPatternWindows(todayIso, INCIDENT_PATTERN_WINDOW_DAYS);

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

  // Go-live gap list, item 7: the client's own threshold override, if
  // staff have set one for this company — migration 208's new
  // company-scoped, risk.read-gated client-read policy. A missing row
  // (the common case) means assembleComplianceTwin()'s own documented
  // defaults apply, exactly as the admin side already does.
  const { data: thresholdsRow } = await supabase.from('compliance_twin_thresholds')
    .select('audit_score_low_threshold, evidence_red_threshold, evidence_amber_threshold, objectives_on_track_amber_threshold, waste_non_conformance_amber_threshold')
    .eq('company_id', companyId).maybeSingle();
  const thresholds: ComplianceTwinThresholds | undefined = thresholdsRow ? {
    auditScoreLowThreshold: thresholdsRow.audit_score_low_threshold,
    evidenceRedThreshold: thresholdsRow.evidence_red_threshold,
    evidenceAmberThreshold: thresholdsRow.evidence_amber_threshold,
    objectivesOnTrackAmberThreshold: thresholdsRow.objectives_on_track_amber_threshold,
    wasteNonConformanceAmberThreshold: thresholdsRow.waste_non_conformance_amber_threshold,
  } : undefined;

  const twin = assembleComplianceTwin({ hsKpis, governanceKpis, riskGraph, incidentPatterns, evidence }, thresholds);
  const assuranceSnapshot = assembleAssuranceToday(counts, twin, today);

  // --- Board Assurance — identical reads to the old standalone
  // /protect/board-assurance page: ISSUED reports only, RLS already
  // refuses a draft to a client session, this .eq('status','issued')
  // is defence in depth, the same posture every read-only PROTECT page
  // in this codebase already carries. ---
  const { data: reportsRaw, error: reportsError } = await supabase
    .from('board_assurance_reports')
    .select('id, year, quarter, issued_at, report_data')
    .eq('company_id', companyId)
    .eq('status', 'issued')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(40);

  const reportRows = (reportsRaw ?? []) as BoardReportRow[];
  const reportIds = reportRows.map(r => r.id);
  const { data: acksRaw, error: ackError } = reportIds.length > 0
    ? await supabase.from('board_assurance_acknowledgements')
        .select('report_id, acknowledged_by_name, comment, acknowledged_at')
        .in('report_id', reportIds).order('acknowledged_at', { ascending: false })
    : { data: [] as AckRow[], error: null };

  const acksByReport = new Map<string, AckRow[]>();
  for (const a of (acksRaw ?? []) as AckRow[]) {
    const list = acksByReport.get(a.report_id) ?? [];
    list.push(a);
    acksByReport.set(a.report_id, list);
  }

  const loadError =
    actionsPage.error ?? legalObligationsPage.error ?? docsReviewDuePage.error ?? incidentsPage.error ??
    deploymentStatusPage.error ?? equipmentPage.error ?? auditFindingsPage.error ?? contractorsPage.error ??
    contractorInsurancesPage.error ?? environmentalPermitsPage.error ?? managementReviewsPage.error ??
    serviceRequestsPage.error ?? consultancyVisitsPage.error ??
    hazards.error ?? riskAssessments.error ?? raItems.error ?? controlLinks.error ?? obligationsRaw.error ??
    trainingRows.error ?? spillRows.error ?? wasteRows.error ??
    incidents12mo.error ?? activities.error ?? equipment.error ??
    wasteMovementsForGov.error ?? objectives.error ?? activeEmployeeCountRes.error?.message ??
    windowIncidents.error ?? priorIncidents.error ?? investigations.error ?? causes.error ??
    filesRes.error?.message ?? completionsRes.error?.message ?? itemsRes.error?.message ?? null;

  return (
    <main className="portal-page flex-1 space-y-6">
      <Core360StatusView
        snapshot={core360Snapshot}
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

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--ink)' }}>EHS Posture — Right Now</h2>
        <AssuranceTodayView
          snapshot={assuranceSnapshot}
          loadError={loadError}
          twinLinks={{
            safety: '/protect/incidents',
            governance: '/protect/legal-register',
            risk_graph: '/protect/risk-graph',
            incident_patterns: '/protect/incident-patterns',
            evidence: '/protect/evidence',
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--ink)' }}>Board Assurance</h2>
        <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
          A quarterly summary of your organisation&rsquo;s compliance position across Safety, Governance, Risk,
          Incidents and Evidence, assembled from the same records shown throughout this platform. Once issued,
          a board member can read it here and record that they have reviewed it.
        </div>

        {(reportsError || ackError) && (
          <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>
            Board assurance reports could not be loaded. Refresh to try again.
          </p>
        )}

        {!reportsError && reportRows.length === 0 ? (
          <div className="card p-12">
            <div className="empty-state">
              <ShieldCheck size={28} style={{ color: 'var(--blue)' }} />
              <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>
                No board assurance reports have been issued yet
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {reportRows.map(r => {
              const acknowledgements = acksByReport.get(r.id) ?? [];
              return (
                <section key={r.id} className="card p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="badge" style={{ background: BAND_COLOUR[r.report_data.overallBand], color: 'white' }}>
                      {BAND_LABEL[r.report_data.overallBand] ?? r.report_data.overallBand}
                    </span>
                    <strong>Q{r.quarter} {r.year}</strong>
                    <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Issued {fmt(r.issued_at)}</span>
                    {r.report_data.trend && (
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        Trend: {TREND_LABEL[r.report_data.trend] ?? r.report_data.trend}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {r.report_data.complianceTwin.areas.map(a => (
                      <div key={a.area} className="p-2" style={{ borderLeft: `3px solid ${BAND_COLOUR[a.band]}` }}>
                        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{a.label}</p>
                        <ul className="text-xs space-y-0.5">
                          {a.reasons.map((reason, i) => <li key={i} style={{ color: 'var(--ink-soft)' }}>{reason}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--line)' }}>
                    <p className="text-xs font-medium" style={{ color: 'var(--ink-faint)' }}>
                      {acknowledgements.length === 0
                        ? 'No board member has acknowledged this report yet.'
                        : `Acknowledged by ${acknowledgements.length} board member${acknowledgements.length === 1 ? '' : 's'}:`}
                    </p>
                    {acknowledgements.length > 0 && (
                      <ul className="space-y-1">
                        {acknowledgements.map((a, i) => (
                          <li key={i} className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                            <strong>{a.acknowledged_by_name}</strong> — {fmt(a.acknowledged_at)}
                            {a.comment && <span> &mdash; &ldquo;{a.comment}&rdquo;</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <BoardAssuranceAcknowledge reportId={r.id} />
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
