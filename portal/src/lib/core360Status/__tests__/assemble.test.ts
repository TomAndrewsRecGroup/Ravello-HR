import { describe, expect, it } from 'vitest';
import { assembleCore360Status, computeTrainingExpiry, computeEnvironmentalOpen, type Core360StatusInput } from '../assemble';
import type { PortfolioCounts } from '@/lib/health/portfolioCounts';
import type { RiskGraphIntelligence } from '@/lib/riskGraph/intelligence';

const TODAY = new Date('2026-08-20T00:00:00Z');

const CLEAN_COUNTS: PortfolioCounts = {
  open_critical_actions: 0, overdue_legal_evaluations: 0, overdue_controlled_documents: 0,
  open_incident_investigations: 0, safety_critical_gaps: 0, workers_not_ready: 0,
  assets_unavailable: 0, major_audit_findings: 0, contractor_expiring: 0,
  environmental_permits_expiring: 0, management_reviews_due: 0, outstanding_service_requests: 0,
  next_consultant_visit_date: null,
};

const CLEAN_RISK_GRAPH: RiskGraphIntelligence = {
  uncoveredHazards: [], ineffectiveSharedControls: [], assessmentsWithIneffectiveControls: [], unlinkedApplicableObligations: [],
};

function baseInput(overrides: Partial<Core360StatusInput> = {}): Core360StatusInput {
  return {
    portfolioCounts: structuredClone(CLEAN_COUNTS),
    riskGraph: structuredClone(CLEAN_RISK_GRAPH),
    trainingRows: [],
    environmentalSpills: [],
    wasteMovements: [],
    today: TODAY,
    ...overrides,
  };
}

describe('computeTrainingExpiry', () => {
  it('a record expired before today counts as expired', () => {
    expect(computeTrainingExpiry([{ expires_on: '2026-08-01' }], TODAY)).toEqual({ expired: 1, expiringSoon: 0 });
  });
  it('a record expiring exactly today counts as expired, not expiring soon', () => {
    expect(computeTrainingExpiry([{ expires_on: '2026-08-20' }], TODAY)).toEqual({ expired: 1, expiringSoon: 0 });
  });
  it('a record expiring within the window counts as expiring soon', () => {
    expect(computeTrainingExpiry([{ expires_on: '2026-09-10' }], TODAY)).toEqual({ expired: 0, expiringSoon: 1 });
  });
  it('a null expires_on is never counted either way (no expiry)', () => {
    expect(computeTrainingExpiry([{ expires_on: null }], TODAY)).toEqual({ expired: 0, expiringSoon: 0 });
  });
  it('a record far beyond the window is counted as neither', () => {
    expect(computeTrainingExpiry([{ expires_on: '2027-06-01' }], TODAY)).toEqual({ expired: 0, expiringSoon: 0 });
  });
});

describe('computeEnvironmentalOpen', () => {
  it('a closed spill is not open; any other status is', () => {
    const r = computeEnvironmentalOpen(
      [{ status: 'closed' }, { status: 'reported' }, { status: 'contained' }],
      [],
    );
    expect(r.openSpills).toBe(2);
  });
  it('only non_conformance=true waste movements count', () => {
    const r = computeEnvironmentalOpen([], [{ non_conformance: false }, { non_conformance: true }, { non_conformance: true }]);
    expect(r.wasteNonConformances).toBe(2);
  });
});

describe('assembleCore360Status', () => {
  it('an entirely clean input is ok across all six domains', () => {
    const snap = assembleCore360Status(baseInput());
    expect(snap.overallBand).toBe('ok');
    expect(snap.domains).toHaveLength(6);
    for (const d of snap.domains) expect(d.band).toBe('ok');
  });

  it('a safety-critical gap makes People critical, not merely attention', () => {
    const snap = assembleCore360Status(baseInput({ portfolioCounts: { ...CLEAN_COUNTS, workers_not_ready: 1, safety_critical_gaps: 1 } }));
    const people = snap.domains.find(d => d.domain === 'people')!;
    expect(people.band).toBe('critical');
  });

  it('a not-ready worker with NO safety-critical gap is only attention', () => {
    const snap = assembleCore360Status(baseInput({ portfolioCounts: { ...CLEAN_COUNTS, workers_not_ready: 2, safety_critical_gaps: 0 } }));
    const people = snap.domains.find(d => d.domain === 'people')!;
    expect(people.band).toBe('attention');
  });

  it('1-2 unavailable assets is Plant attention; 3+ is critical', () => {
    const attn = assembleCore360Status(baseInput({ portfolioCounts: { ...CLEAN_COUNTS, assets_unavailable: 2 } }));
    expect(attn.domains.find(d => d.domain === 'plant')!.band).toBe('attention');
    const crit = assembleCore360Status(baseInput({ portfolioCounts: { ...CLEAN_COUNTS, assets_unavailable: 3 } }));
    expect(crit.domains.find(d => d.domain === 'plant')!.band).toBe('critical');
  });

  it('an expired training record makes Training critical; expiring-only is attention', () => {
    const crit = assembleCore360Status(baseInput({ trainingRows: [{ expires_on: '2026-07-01' }] }));
    expect(crit.domains.find(d => d.domain === 'training')!.band).toBe('critical');
    const attn = assembleCore360Status(baseInput({ trainingRows: [{ expires_on: '2026-09-01' }] }));
    expect(attn.domains.find(d => d.domain === 'training')!.band).toBe('attention');
  });

  it('an ineffective SHARED control makes Risk Controls critical; an uncovered hazard alone is attention', () => {
    const crit = assembleCore360Status(baseInput({
      riskGraph: { ...CLEAN_RISK_GRAPH, ineffectiveSharedControls: [{ controlId: 'c1', controlTitle: 'Guarding', effectiveness: 'ineffective', assessmentCount: 2, assessmentIds: ['a1', 'a2'] }] },
    }));
    expect(crit.domains.find(d => d.domain === 'risk_controls')!.band).toBe('critical');
    const attn = assembleCore360Status(baseInput({
      riskGraph: { ...CLEAN_RISK_GRAPH, uncoveredHazards: [{ id: 'h1', title: 'Noise' }] },
    }));
    expect(attn.domains.find(d => d.domain === 'risk_controls')!.band).toBe('attention');
  });

  it('an open spill makes Environmental critical; a waste non-conformance alone is attention', () => {
    const crit = assembleCore360Status(baseInput({ environmentalSpills: [{ status: 'reported' }] }));
    expect(crit.domains.find(d => d.domain === 'environmental')!.band).toBe('critical');
    const attn = assembleCore360Status(baseInput({ wasteMovements: [{ non_conformance: true }] }));
    expect(attn.domains.find(d => d.domain === 'environmental')!.band).toBe('attention');
  });

  it('expiring environmental permits alone (no spill, no waste issue) is Environmental attention', () => {
    const snap = assembleCore360Status(baseInput({ portfolioCounts: { ...CLEAN_COUNTS, environmental_permits_expiring: 1 } }));
    expect(snap.domains.find(d => d.domain === 'environmental')!.band).toBe('attention');
  });

  it('Contractors has no critical tier — any flagged contractor is attention', () => {
    const snap = assembleCore360Status(baseInput({ portfolioCounts: { ...CLEAN_COUNTS, contractor_expiring: 5 } }));
    expect(snap.domains.find(d => d.domain === 'contractors')!.band).toBe('attention');
  });

  it('overallBand is the WORST of the six domains', () => {
    const snap = assembleCore360Status(baseInput({ portfolioCounts: { ...CLEAN_COUNTS, assets_unavailable: 1, contractor_expiring: 1 } }));
    expect(snap.overallBand).toBe('attention'); // no domain critical, but one is attention
    const snap2 = assembleCore360Status(baseInput({ trainingRows: [{ expires_on: '2026-01-01' }] }));
    expect(snap2.overallBand).toBe('critical');
  });

  it('a domain with nothing wrong reports a single, clean reason', () => {
    const snap = assembleCore360Status(baseInput());
    for (const d of snap.domains) expect(d.reasons).toHaveLength(1);
  });
});
