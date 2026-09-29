import { describe, expect, it } from 'vitest';
import { computeGovernanceKpis, type GovernanceKpiInput } from './kpis';

const TODAY = '2026-09-29';

const BASE: GovernanceKpiInput = {
  incidentsLast12MonthsCount: 0,
  activeEmployeeCount: 0,
  wasteMovements: [],
  objectives: [],
  legalObligations: [],
  today: TODAY,
};

describe('computeGovernanceKpis', () => {
  it('is deterministic: the same input produces byte-identical output on repeated calls', () => {
    const input: GovernanceKpiInput = {
      ...BASE,
      incidentsLast12MonthsCount: 3,
      activeEmployeeCount: 40,
      wasteMovements: [{ non_conformance: true, moved_at: '2026-08-01' }, { non_conformance: false, moved_at: '2026-08-02' }],
      objectives: [{ status: 'on_track' }, { status: 'at_risk' }, { status: 'draft' }],
      legalObligations: [{ applicability_status: 'applicable', next_review_due: '2026-01-01' }],
    };
    const first = computeGovernanceKpis(input);
    const second = computeGovernanceKpis(input);
    expect(second).toEqual(first);
    // computeGovernanceKpis is pure: neither call may have mutated the shared input arrays
    expect(input.wasteMovements).toHaveLength(2);
  });

  it('computes incident frequency per 100 active employees, null with no active employees', () => {
    expect(computeGovernanceKpis({ ...BASE, incidentsLast12MonthsCount: 4, activeEmployeeCount: 200 }).incidentFrequencyRatePer100).toBe(2);
    expect(computeGovernanceKpis({ ...BASE, incidentsLast12MonthsCount: 4, activeEmployeeCount: 0 }).incidentFrequencyRatePer100).toBeNull();
  });

  it('computes waste non-conformance percent, null with no recorded movements', () => {
    const kpis = computeGovernanceKpis({
      ...BASE,
      wasteMovements: [
        { non_conformance: true, moved_at: '2026-01-01' },
        { non_conformance: false, moved_at: '2026-01-02' },
        { non_conformance: false, moved_at: '2026-01-03' },
        { non_conformance: false, moved_at: '2026-01-04' },
      ],
    });
    expect(kpis.wasteNonConformancePercent).toBe(25);
    expect(computeGovernanceKpis(BASE).wasteNonConformancePercent).toBeNull();
  });

  it('excludes draft and abandoned objectives from the on-track denominator', () => {
    const kpis = computeGovernanceKpis({
      ...BASE,
      objectives: [
        { status: 'on_track' }, { status: 'achieved' }, { status: 'at_risk' }, { status: 'missed' },
        { status: 'draft' }, { status: 'abandoned' },
      ],
    });
    // 2 on-track/achieved out of 4 counted (on_track, achieved, at_risk, missed)
    expect(kpis.objectivesOnTrackPercent).toBe(50);
  });

  it('is null for objectives-on-track when every objective is draft or abandoned', () => {
    const kpis = computeGovernanceKpis({ ...BASE, objectives: [{ status: 'draft' }, { status: 'abandoned' }] });
    expect(kpis.objectivesOnTrackPercent).toBeNull();
  });

  it('counts only applicable obligations whose own review date has passed', () => {
    const kpis = computeGovernanceKpis({
      ...BASE,
      legalObligations: [
        { applicability_status: 'applicable', next_review_due: '2026-01-01' },     // overdue
        { applicability_status: 'applicable', next_review_due: '2027-01-01' },     // not yet due
        { applicability_status: 'applicable', next_review_due: null },             // never reviewed at all — not "overdue"
        { applicability_status: 'not_applicable', next_review_due: '2020-01-01' }, // not applicable — excluded
        { applicability_status: 'under_review', next_review_due: '2020-01-01' },   // not yet a confirmed decision — excluded
      ],
    });
    expect(kpis.overdueLegalEvaluationsCount).toBe(1);
  });

  it('reports a data-source string for every KPI', () => {
    const kpis = computeGovernanceKpis(BASE);
    expect(Object.keys(kpis.dataSource).sort()).toEqual([
      'incidentFrequencyRatePer100', 'objectivesOnTrackPercent', 'overdueLegalEvaluationsCount', 'wasteNonConformancePercent',
    ].sort());
    for (const v of Object.values(kpis.dataSource)) expect(typeof v).toBe('string');
  });
});
