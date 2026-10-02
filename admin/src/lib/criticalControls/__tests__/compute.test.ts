import { describe, it, expect } from 'vitest';
import { computeCriticalControlVisibility, type CriticalControlCatalogueRow, type CriticalControlUseRow, type CriticalControlAssessmentRow } from '../compute';

const ASSESSMENTS: CriticalControlAssessmentRow[] = [
  { id: 'ra-1', title: 'Confined Space Entry RA', status: 'approved' },
  { id: 'ra-2', title: 'Machine Guarding RA', status: 'approved' },
];

describe('computeCriticalControlVisibility', () => {
  it('excludes a control that is not marked safety_critical', () => {
    const catalogue: CriticalControlCatalogueRow[] = [{ id: 'c1', title: 'Guard rail', safety_critical: false, status: 'active' }];
    const uses: CriticalControlUseRow[] = [{ risk_assessment_item_id: 'i1', risk_assessment_id: 'ra-1', control_id: 'c1', effectiveness: 'ineffective' }];
    expect(computeCriticalControlVisibility(catalogue, uses, ASSESSMENTS)).toHaveLength(0);
  });

  it('excludes a retired safety-critical control', () => {
    const catalogue: CriticalControlCatalogueRow[] = [{ id: 'c1', title: 'Old gas detector', safety_critical: true, status: 'retired' }];
    const uses: CriticalControlUseRow[] = [{ risk_assessment_item_id: 'i1', risk_assessment_id: 'ra-1', control_id: 'c1', effectiveness: 'ineffective' }];
    expect(computeCriticalControlVisibility(catalogue, uses, ASSESSMENTS)).toHaveLength(0);
  });

  it('excludes a safety-critical control with zero uses', () => {
    const catalogue: CriticalControlCatalogueRow[] = [{ id: 'c1', title: 'Gas detector', safety_critical: true, status: 'active' }];
    expect(computeCriticalControlVisibility(catalogue, [], ASSESSMENTS)).toHaveLength(0);
  });

  it('bands a control in_place as effective', () => {
    const catalogue: CriticalControlCatalogueRow[] = [{ id: 'c1', title: 'Gas detector', safety_critical: true, status: 'active' }];
    const uses: CriticalControlUseRow[] = [{ risk_assessment_item_id: 'i1', risk_assessment_id: 'ra-1', control_id: 'c1', effectiveness: 'in_place' }];
    const [status] = computeCriticalControlVisibility(catalogue, uses, ASSESSMENTS);
    expect(status.band).toBe('effective');
    expect(status.gapCount).toBe(0);
  });

  it('bands ineffective and not_implemented as a gap, distinct from unverified', () => {
    const catalogue: CriticalControlCatalogueRow[] = [{ id: 'c1', title: 'Gas detector', safety_critical: true, status: 'active' }];
    const ineffective = computeCriticalControlVisibility(catalogue,
      [{ risk_assessment_item_id: 'i1', risk_assessment_id: 'ra-1', control_id: 'c1', effectiveness: 'ineffective' }], ASSESSMENTS);
    expect(ineffective[0].band).toBe('gap');

    const unverified = computeCriticalControlVisibility(catalogue,
      [{ risk_assessment_item_id: 'i1', risk_assessment_id: 'ra-1', control_id: 'c1', effectiveness: 'verification_required' }], ASSESSMENTS);
    expect(unverified[0].band).toBe('unverified');
    expect(unverified[0].gapCount).toBe(0);
  });

  it('a control relied on by two assessments takes the WORST band across both', () => {
    const catalogue: CriticalControlCatalogueRow[] = [{ id: 'c1', title: 'Gas detector', safety_critical: true, status: 'active' }];
    const uses: CriticalControlUseRow[] = [
      { risk_assessment_item_id: 'i1', risk_assessment_id: 'ra-1', control_id: 'c1', effectiveness: 'in_place' },
      { risk_assessment_item_id: 'i2', risk_assessment_id: 'ra-2', control_id: 'c1', effectiveness: 'not_implemented' },
    ];
    const [status] = computeCriticalControlVisibility(catalogue, uses, ASSESSMENTS);
    expect(status.band).toBe('gap');
    expect(status.uses).toHaveLength(2);
  });

  it('resolves each use\'s risk assessment title by id', () => {
    const catalogue: CriticalControlCatalogueRow[] = [{ id: 'c1', title: 'Gas detector', safety_critical: true, status: 'active' }];
    const uses: CriticalControlUseRow[] = [{ risk_assessment_item_id: 'i1', risk_assessment_id: 'ra-1', control_id: 'c1', effectiveness: 'ineffective' }];
    const [status] = computeCriticalControlVisibility(catalogue, uses, ASSESSMENTS);
    expect(status.uses[0].riskAssessmentTitle).toBe('Confined Space Entry RA');
  });

  it('sorts gap controls before unverified before effective', () => {
    const catalogue: CriticalControlCatalogueRow[] = [
      { id: 'c1', title: 'A — effective', safety_critical: true, status: 'active' },
      { id: 'c2', title: 'B — gap', safety_critical: true, status: 'active' },
      { id: 'c3', title: 'C — unverified', safety_critical: true, status: 'active' },
    ];
    const uses: CriticalControlUseRow[] = [
      { risk_assessment_item_id: 'i1', risk_assessment_id: 'ra-1', control_id: 'c1', effectiveness: 'in_place' },
      { risk_assessment_item_id: 'i2', risk_assessment_id: 'ra-1', control_id: 'c2', effectiveness: 'ineffective' },
      { risk_assessment_item_id: 'i3', risk_assessment_id: 'ra-1', control_id: 'c3', effectiveness: 'verification_required' },
    ];
    const statuses = computeCriticalControlVisibility(catalogue, uses, ASSESSMENTS);
    expect(statuses.map(s => s.controlId)).toEqual(['c2', 'c3', 'c1']);
  });
});
