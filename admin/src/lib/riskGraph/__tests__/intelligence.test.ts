import { describe, expect, it } from 'vitest';
import { computeRiskGraphIntelligence, type RiskGraphIntelligenceInput } from '../intelligence';

function baseInput(): RiskGraphIntelligenceInput {
  return {
    hazards: [],
    riskAssessments: [],
    riskAssessmentItems: [],
    controlLinks: [],
    legalObligations: [],
    legalObligationLinks: [],
  };
}

describe('computeRiskGraphIntelligence', () => {
  describe('uncoveredHazards', () => {
    it('flags a hazard with zero risk_assessment_items referencing it', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        hazards: [{ id: 'h1', title: 'Loose railing', status: 'identified' }],
      });
      expect(out.uncoveredHazards).toEqual([{ id: 'h1', title: 'Loose railing' }]);
    });

    it('does not flag a hazard a risk_assessment_item references', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        hazards: [{ id: 'h1', title: 'Loose railing', status: 'identified' }],
        riskAssessmentItems: [{ id: 'i1', risk_assessment_id: 'ra1', hazard_id: 'h1' }],
      });
      expect(out.uncoveredHazards).toEqual([]);
    });

    it('never flags a closed or archived hazard, even with no coverage', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        hazards: [
          { id: 'h1', title: 'Closed one', status: 'closed' },
          { id: 'h2', title: 'Archived one', status: 'archived' },
        ],
      });
      expect(out.uncoveredHazards).toEqual([]);
    });

    it('ignores a risk_assessment_item with a null hazard_id (free-text hazard, no linked record)', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        hazards: [{ id: 'h1', title: 'Loose railing', status: 'identified' }],
        riskAssessmentItems: [{ id: 'i1', risk_assessment_id: 'ra1', hazard_id: null }],
      });
      expect(out.uncoveredHazards).toEqual([{ id: 'h1', title: 'Loose railing' }]);
    });
  });

  describe('ineffectiveSharedControls', () => {
    it('flags a control recorded ineffective and relied on by 2+ distinct assessments', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        riskAssessmentItems: [
          { id: 'i1', risk_assessment_id: 'ra1', hazard_id: null },
          { id: 'i2', risk_assessment_id: 'ra2', hazard_id: null },
        ],
        controlLinks: [
          { risk_assessment_item_id: 'i1', control_id: 'c1', control_title: 'LEV extraction', effectiveness: 'ineffective' },
          { risk_assessment_item_id: 'i2', control_id: 'c1', control_title: 'LEV extraction', effectiveness: 'in_place' },
        ],
      });
      expect(out.ineffectiveSharedControls).toHaveLength(1);
      expect(out.ineffectiveSharedControls[0]).toMatchObject({ controlId: 'c1', assessmentCount: 2 });
    });

    it('does NOT flag an ineffective control used by only ONE assessment — that is a single-assessment concern, not a shared-exposure one', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        riskAssessmentItems: [{ id: 'i1', risk_assessment_id: 'ra1', hazard_id: null }],
        controlLinks: [{ risk_assessment_item_id: 'i1', control_id: 'c1', control_title: 'LEV extraction', effectiveness: 'ineffective' }],
      });
      expect(out.ineffectiveSharedControls).toEqual([]);
    });

    it('does not flag a control shared across assessments if it is recorded as in_place everywhere', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        riskAssessmentItems: [
          { id: 'i1', risk_assessment_id: 'ra1', hazard_id: null },
          { id: 'i2', risk_assessment_id: 'ra2', hazard_id: null },
        ],
        controlLinks: [
          { risk_assessment_item_id: 'i1', control_id: 'c1', control_title: 'LEV extraction', effectiveness: 'in_place' },
          { risk_assessment_item_id: 'i2', control_id: 'c1', control_title: 'LEV extraction', effectiveness: 'in_place' },
        ],
      });
      expect(out.ineffectiveSharedControls).toEqual([]);
    });

    it('sorts by assessmentCount descending — the widest-impact gap first', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        riskAssessmentItems: [
          { id: 'i1', risk_assessment_id: 'ra1', hazard_id: null },
          { id: 'i2', risk_assessment_id: 'ra2', hazard_id: null },
          { id: 'i3', risk_assessment_id: 'ra3', hazard_id: null },
          { id: 'i4', risk_assessment_id: 'ra4', hazard_id: null },
        ],
        controlLinks: [
          { risk_assessment_item_id: 'i1', control_id: 'c1', control_title: 'Small', effectiveness: 'ineffective' },
          { risk_assessment_item_id: 'i2', control_id: 'c1', control_title: 'Small', effectiveness: 'ineffective' },
          { risk_assessment_item_id: 'i3', control_id: 'c2', control_title: 'Big', effectiveness: 'not_implemented' },
          { risk_assessment_item_id: 'i4', control_id: 'c2', control_title: 'Big', effectiveness: 'not_implemented' },
        ],
      });
      // Both have count 2 in this fixture; add a third assessment to c2 to make the ordering unambiguous.
      const out2 = computeRiskGraphIntelligence({
        ...baseInput(),
        riskAssessmentItems: [
          { id: 'i1', risk_assessment_id: 'ra1', hazard_id: null },
          { id: 'i2', risk_assessment_id: 'ra2', hazard_id: null },
          { id: 'i3', risk_assessment_id: 'ra3', hazard_id: null },
        ],
        controlLinks: [
          { risk_assessment_item_id: 'i1', control_id: 'c1', control_title: 'Small', effectiveness: 'ineffective' },
          { risk_assessment_item_id: 'i2', control_id: 'c1', control_title: 'Small', effectiveness: 'ineffective' },
          { risk_assessment_item_id: 'i3', control_id: 'c2', control_title: 'Big', effectiveness: 'not_implemented' },
        ],
      });
      expect(out.ineffectiveSharedControls.map(c => c.controlId)).toEqual(['c1', 'c2']);
      expect(out2.ineffectiveSharedControls[0].controlId).toBe('c1');
    });

    it('a risk_item_controls row whose item has no matching risk_assessment_item is ignored (defensive, never throws)', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        controlLinks: [{ risk_assessment_item_id: 'orphan', control_id: 'c1', control_title: 'X', effectiveness: 'ineffective' }],
      });
      expect(out.ineffectiveSharedControls).toEqual([]);
    });
  });

  describe('assessmentsWithIneffectiveControls', () => {
    it('flags an approved assessment carrying an ineffective control, regardless of sharing', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        riskAssessments: [{ id: 'ra1', title: 'Confined space entry', status: 'approved' }],
        riskAssessmentItems: [{ id: 'i1', risk_assessment_id: 'ra1', hazard_id: null }],
        controlLinks: [{ risk_assessment_item_id: 'i1', control_id: 'c1', control_title: 'Gas monitor', effectiveness: 'not_implemented' }],
      });
      expect(out.assessmentsWithIneffectiveControls).toEqual([
        { riskAssessmentId: 'ra1', title: 'Confined space entry', status: 'approved', ineffectiveControlTitles: ['Gas monitor'] },
      ]);
    });

    it('does NOT flag a draft assessment — only approved/active/review_due are a client currently relying on', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        riskAssessments: [{ id: 'ra1', title: 'Draft RA', status: 'draft' }],
        riskAssessmentItems: [{ id: 'i1', risk_assessment_id: 'ra1', hazard_id: null }],
        controlLinks: [{ risk_assessment_item_id: 'i1', control_id: 'c1', control_title: 'Gas monitor', effectiveness: 'not_implemented' }],
      });
      expect(out.assessmentsWithIneffectiveControls).toEqual([]);
    });

    it('does not flag an approved assessment whose controls are all in_place', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        riskAssessments: [{ id: 'ra1', title: 'Fine', status: 'active' }],
        riskAssessmentItems: [{ id: 'i1', risk_assessment_id: 'ra1', hazard_id: null }],
        controlLinks: [{ risk_assessment_item_id: 'i1', control_id: 'c1', control_title: 'Gas monitor', effectiveness: 'in_place' }],
      });
      expect(out.assessmentsWithIneffectiveControls).toEqual([]);
    });
  });

  describe('unlinkedApplicableObligations', () => {
    it('flags an applicable obligation with no hs_links row naming it', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        legalObligations: [{ id: 'o1', title: 'COSHH Regulations 2002', applicability_status: 'applicable' }],
      });
      expect(out.unlinkedApplicableObligations).toEqual([{ id: 'o1', title: 'COSHH Regulations 2002' }]);
    });

    it('does not flag an obligation linked as the FROM end of an hs_links row', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        legalObligations: [{ id: 'o1', title: 'COSHH Regulations 2002', applicability_status: 'applicable' }],
        legalObligationLinks: [{ from_type: 'legal_obligation', from_id: 'o1', to_type: 'risk_assessment', to_id: 'ra1' }],
      });
      expect(out.unlinkedApplicableObligations).toEqual([]);
    });

    it('does not flag an obligation linked to a hazard specifically', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        legalObligations: [{ id: 'o1', title: 'COSHH Regulations 2002', applicability_status: 'applicable' }],
        legalObligationLinks: [{ from_type: 'hazard', from_id: 'h1', to_type: 'legal_obligation', to_id: 'o1' }],
      });
      expect(out.unlinkedApplicableObligations).toEqual([]);
    });

    it('STILL flags an obligation whose only hs_links connection is to something OTHER than a hazard or risk assessment — a link to a document or incident says nothing about risk-assessment coverage, which is what this insight\'s own label promises', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        legalObligations: [{ id: 'o1', title: 'COSHH Regulations 2002', applicability_status: 'applicable' }],
        legalObligationLinks: [
          { from_type: 'legal_obligation', from_id: 'o1', to_type: 'incident', to_id: 'inc1' },
          { from_type: 'document', from_id: 'd1', to_type: 'legal_obligation', to_id: 'o1' },
        ],
      });
      expect(out.unlinkedApplicableObligations).toEqual([{ id: 'o1', title: 'COSHH Regulations 2002' }]);
    });

    it('does not flag an obligation linked as the TO end of an hs_links row', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        legalObligations: [{ id: 'o1', title: 'COSHH Regulations 2002', applicability_status: 'applicable' }],
        legalObligationLinks: [{ from_type: 'hazard', from_id: 'h1', to_type: 'legal_obligation', to_id: 'o1' }],
      });
      expect(out.unlinkedApplicableObligations).toEqual([]);
    });

    it('never flags a not_applicable, not_assessed or under_review obligation', () => {
      const out = computeRiskGraphIntelligence({
        ...baseInput(),
        legalObligations: [
          { id: 'o1', title: 'Not applicable here', applicability_status: 'not_applicable' },
          { id: 'o2', title: 'Not yet assessed', applicability_status: 'not_assessed' },
          { id: 'o3', title: 'Under review', applicability_status: 'under_review' },
        ],
      });
      expect(out.unlinkedApplicableObligations).toEqual([]);
    });
  });
});
