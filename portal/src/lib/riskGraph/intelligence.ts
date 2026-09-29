// Core-OS 360 Phase 8, Group 2: Connected Compliance Intelligence.
//
// Sibling to lib/hs/kpis.ts / lib/governance/kpis.ts — pure,
// deterministic, computed at READ TIME from existing rows. No stored
// aggregate, no AI, no significance judgement, no score. What makes
// this module different from those two: every insight here is a
// CONNECTION-shaped question — one no single-entity view can answer on
// its own, because the fact only exists in the relationship between
// two records, not in either record alone.
//
// The relationships used are the REAL structural ones this schema
// already has, checked before writing a line of code — not hs_links
// for everything:
//   - risk_assessment_items.hazard_id is a direct FK (123). A hazard's
//     coverage by a risk assessment is THIS, never an hs_links row —
//     hs_links exists for the OTHER relationships (an incident report
//     pointing at an assessment, a related hazard/incident pair), the
//     exact split RaLinks.tsx's own header comment already documents.
//   - risk_item_controls links a risk_assessment_item to a control,
//     denormalising control_title/control_type/effectiveness onto the
//     row itself — grouping by control_id is how "this control is
//     relied on by N assessments" is answered.
//   - A legal obligation has NO direct FK to a risk assessment or
//     hazard at all; the only connection is an explicit hs_links row
//     (122) an admin adds by hand. Absence of one is itself the
//     insight ("nothing here shows this obligation is covered by your
//     risk assessments yet") — not a defect, since not every legal
//     obligation NEEDS a risk assessment, but a genuine gap worth a
//     human's look.

export interface RiskGraphHazard {
  id: string;
  title: string;
  status: string;
}

export interface RiskGraphRiskAssessmentItem {
  id: string;
  risk_assessment_id: string;
  hazard_id: string | null;
}

export interface RiskGraphRiskAssessment {
  id: string;
  title: string;
  status: string;
}

export interface RiskGraphControlLink {
  risk_assessment_item_id: string;
  control_id: string;
  control_title: string;
  effectiveness: string;
}

export interface RiskGraphLegalObligation {
  id: string;
  /**
   * organisation_legal_obligations itself has no title column — it is
   * the WRITABLE per-client row; the title lives on the staff-only
   * legal_requirements catalogue it references. The loader resolves
   * this by id before calling in, the same "join by id list, never a
   * bare client read of the catalogue" pattern the Legal Register's
   * own portal page already uses (159).
   */
  title: string;
  applicability_status: string;
}

/** One row of hs_links, both ends already known to be an obligation<->assessment/hazard pair. */
export interface RiskGraphLink {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
}

export interface RiskGraphIntelligenceInput {
  hazards: RiskGraphHazard[];
  riskAssessments: RiskGraphRiskAssessment[];
  riskAssessmentItems: RiskGraphRiskAssessmentItem[];
  controlLinks: RiskGraphControlLink[];
  legalObligations: RiskGraphLegalObligation[];
  /** hs_links rows where either end is 'legal_obligation' and the other is 'risk_assessment' or 'hazard'. */
  legalObligationLinks: RiskGraphLink[];
}

export interface UncoveredHazard {
  id: string;
  title: string;
}

export interface IneffectiveSharedControl {
  controlId: string;
  controlTitle: string;
  effectiveness: string;
  /** Distinct risk assessments (not items) that rely on this control. */
  assessmentCount: number;
  assessmentIds: string[];
}

export interface AssessmentWithIneffectiveControl {
  riskAssessmentId: string;
  title: string;
  status: string;
  ineffectiveControlTitles: string[];
}

export interface UnlinkedLegalObligation {
  id: string;
  title: string;
}

export interface RiskGraphIntelligence {
  /** Non-closed/archived hazards with no risk_assessment_items referencing them at all. */
  uncoveredHazards: UncoveredHazard[];
  /**
   * Controls relied on by 2+ distinct risk assessments whose OWN recorded
   * effectiveness is 'ineffective' or 'not_implemented' — a single point
   * of failure made visible: if this control genuinely fails, every
   * assessment counting on it is affected, not just one.
   */
  ineffectiveSharedControls: IneffectiveSharedControl[];
  /**
   * Approved/active/review_due risk assessments (the ones a client is
   * currently relying on) that carry at least one control recorded as
   * ineffective or not_implemented, regardless of how many assessments
   * that control is shared with.
   */
  assessmentsWithIneffectiveControls: AssessmentWithIneffectiveControl[];
  /** Applicable legal obligations with no hs_links connection to any risk assessment or hazard. */
  unlinkedApplicableObligations: UnlinkedLegalObligation[];
}

const NON_COVERAGE_HAZARD_STATUSES = new Set(['closed', 'archived']);
const ACTIVE_RA_STATUSES = new Set(['approved', 'active', 'review_due']);
const INEFFECTIVE = new Set(['ineffective', 'not_implemented']);

export function computeRiskGraphIntelligence(input: RiskGraphIntelligenceInput): RiskGraphIntelligence {
  const { hazards, riskAssessments, riskAssessmentItems, controlLinks, legalObligations, legalObligationLinks } = input;

  const coveredHazardIds = new Set(riskAssessmentItems.map(i => i.hazard_id).filter((id): id is string => id != null));
  const uncoveredHazards = hazards
    .filter(h => !NON_COVERAGE_HAZARD_STATUSES.has(h.status) && !coveredHazardIds.has(h.id))
    .map(h => ({ id: h.id, title: h.title }));

  const itemToAssessment = new Map(riskAssessmentItems.map(i => [i.id, i.risk_assessment_id]));
  const assessmentById = new Map(riskAssessments.map(ra => [ra.id, ra]));

  // controlId -> { title, effectiveness (any occurrence), assessmentIds }
  const byControl = new Map<string, { title: string; effectivenessSeen: Set<string>; assessmentIds: Set<string> }>();
  // riskAssessmentId -> ineffective control titles seen
  const ineffectiveByAssessment = new Map<string, Set<string>>();

  for (const link of controlLinks) {
    const raId = itemToAssessment.get(link.risk_assessment_item_id);
    if (!raId) continue;

    let entry = byControl.get(link.control_id);
    if (!entry) { entry = { title: link.control_title, effectivenessSeen: new Set(), assessmentIds: new Set() }; byControl.set(link.control_id, entry); }
    entry.effectivenessSeen.add(link.effectiveness);
    entry.assessmentIds.add(raId);

    if (INEFFECTIVE.has(link.effectiveness)) {
      if (!ineffectiveByAssessment.has(raId)) ineffectiveByAssessment.set(raId, new Set());
      ineffectiveByAssessment.get(raId)!.add(link.control_title);
    }
  }

  const ineffectiveSharedControls: IneffectiveSharedControl[] = [];
  for (const [controlId, entry] of byControl) {
    const isIneffectiveAnywhere = [...entry.effectivenessSeen].some(e => INEFFECTIVE.has(e));
    if (isIneffectiveAnywhere && entry.assessmentIds.size >= 2) {
      ineffectiveSharedControls.push({
        controlId,
        controlTitle: entry.title,
        effectiveness: [...entry.effectivenessSeen].find(e => INEFFECTIVE.has(e))!,
        assessmentCount: entry.assessmentIds.size,
        assessmentIds: [...entry.assessmentIds],
      });
    }
  }
  ineffectiveSharedControls.sort((a, b) => b.assessmentCount - a.assessmentCount);

  const assessmentsWithIneffectiveControls: AssessmentWithIneffectiveControl[] = [];
  for (const [raId, titles] of ineffectiveByAssessment) {
    const ra = assessmentById.get(raId);
    if (!ra || !ACTIVE_RA_STATUSES.has(ra.status)) continue;
    assessmentsWithIneffectiveControls.push({
      riskAssessmentId: raId,
      title: ra.title,
      status: ra.status,
      ineffectiveControlTitles: [...titles],
    });
  }

  const linkedObligationIds = new Set<string>();
  for (const l of legalObligationLinks) {
    if (l.from_type === 'legal_obligation') linkedObligationIds.add(l.from_id);
    if (l.to_type === 'legal_obligation') linkedObligationIds.add(l.to_id);
  }
  const unlinkedApplicableObligations = legalObligations
    .filter(o => o.applicability_status === 'applicable' && !linkedObligationIds.has(o.id))
    .map(o => ({ id: o.id, title: o.title }));

  return {
    uncoveredHazards,
    ineffectiveSharedControls,
    assessmentsWithIneffectiveControls,
    unlinkedApplicableObligations,
  };
}
