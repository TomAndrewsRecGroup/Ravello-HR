import { describe, it, expect } from 'vitest';
import { assembleComplianceTwin, type ComplianceTwinInput } from '../assemble';
import type { HsKpis } from '@/lib/hs/kpis';
import type { GovernanceKpis } from '@/lib/governance/kpis';
import type { RiskGraphIntelligence } from '@/lib/riskGraph/intelligence';
import type { IncidentPatternSummary } from '@/lib/incidentPatterns/analyze';
import type { EvidenceCoverageSummary } from '@/lib/evidenceEngine/analyze';

const CLEAN_HS: HsKpis = {
  incidentsLast12Months: 0,
  riddorLast12Months: 0,
  toolboxTalksLast12Months: 0,
  lastAuditScore: 85,
  auditScoreTrend: 'flat',
  equipmentOverdueCount: 0,
  equipmentDueSoonCount: 0,
};

const CLEAN_GOVERNANCE: GovernanceKpis = {
  incidentFrequencyRatePer100: 0,
  wasteNonConformancePercent: 0,
  objectivesOnTrackPercent: 100,
  overdueLegalEvaluationsCount: 0,
  dataSource: {
    incidentFrequencyRatePer100: '', wasteNonConformancePercent: '',
    objectivesOnTrackPercent: '', overdueLegalEvaluationsCount: '',
  },
};

const CLEAN_RISK_GRAPH: RiskGraphIntelligence = {
  uncoveredHazards: [],
  ineffectiveSharedControls: [],
  assessmentsWithIneffectiveControls: [],
  unlinkedApplicableObligations: [],
};

const CLEAN_INCIDENT_PATTERNS: IncidentPatternSummary = {
  totalIncidents: 0,
  byType: [],
  recurringRootCauses: [],
  siteClusters: [],
  departmentClusters: [],
  severityComparison: {
    currentWindow: { major: 0, critical: 0, fatal: 0 },
    priorWindow: { major: 0, critical: 0, fatal: 0 },
  },
};

const CLEAN_EVIDENCE: EvidenceCoverageSummary = {
  totalCompletions: 10,
  completionsWithEvidenceCount: 10,
  coveragePercent: 100,
  gaps: [],
  currentGaps: [],
  byCategory: [],
};

// A deep clone, not a shallow spread: incidentPatterns.severityComparison
// is a nested object, and a shallow `{ ...CLEAN_INCIDENT_PATTERNS }` would
// share that SAME nested object across every test — one test mutating
// `currentWindow.major` would leak into every test that runs after it.
// Caught by the tests themselves failing when this was first written as
// a shallow spread, not spotted by inspection.
function baseInput(): ComplianceTwinInput {
  return structuredClone({
    hsKpis: CLEAN_HS,
    governanceKpis: CLEAN_GOVERNANCE,
    riskGraph: CLEAN_RISK_GRAPH,
    incidentPatterns: CLEAN_INCIDENT_PATTERNS,
    evidence: CLEAN_EVIDENCE,
  });
}

function areaOf(snapshot: ReturnType<typeof assembleComplianceTwin>, area: string) {
  const a = snapshot.areas.find(x => x.area === area);
  if (!a) throw new Error(`no area ${area}`);
  return a;
}

describe('assembleComplianceTwin', () => {
  it('is entirely green with no adverse facts anywhere', () => {
    const snap = assembleComplianceTwin(baseInput());
    expect(snap.overallBand).toBe('green');
    for (const a of snap.areas) {
      expect(a.band).toBe('green');
      expect(a.reasons).toHaveLength(1);
    }
  });

  describe('safety area', () => {
    it('is red on a RIDDOR-reportable incident', () => {
      const input = baseInput();
      input.hsKpis.riddorLast12Months = 2;
      const a = areaOf(assembleComplianceTwin(input), 'safety');
      expect(a.band).toBe('red');
      expect(a.reasons.join(' ')).toContain('2 RIDDOR-reportable');
    });

    it('is red on overdue equipment', () => {
      const input = baseInput();
      input.hsKpis.equipmentOverdueCount = 1;
      expect(areaOf(assembleComplianceTwin(input), 'safety').band).toBe('red');
    });

    it('is amber on equipment due soon and a low audit score, both reported', () => {
      const input = baseInput();
      input.hsKpis.equipmentDueSoonCount = 3;
      input.hsKpis.lastAuditScore = 60;
      const a = areaOf(assembleComplianceTwin(input), 'safety');
      expect(a.band).toBe('amber');
      expect(a.reasons).toHaveLength(2);
    });

    it('is not amber at exactly the audit score threshold', () => {
      const input = baseInput();
      input.hsKpis.lastAuditScore = 70;
      expect(areaOf(assembleComplianceTwin(input), 'safety').band).toBe('green');
    });

    it('reports the amber reason too when also red, never hiding it behind the worse finding', () => {
      const input = baseInput();
      input.hsKpis.equipmentOverdueCount = 1;
      input.hsKpis.lastAuditScore = 50;
      const a = areaOf(assembleComplianceTwin(input), 'safety');
      expect(a.band).toBe('red');
      expect(a.reasons.some(r => r.includes('overdue'))).toBe(true);
      expect(a.reasons.some(r => r.includes('audit scored'))).toBe(true);
    });

    it('treats a null last audit score as no finding', () => {
      const input = baseInput();
      input.hsKpis.lastAuditScore = null;
      expect(areaOf(assembleComplianceTwin(input), 'safety').band).toBe('green');
    });
  });

  describe('governance area', () => {
    it('is red on an overdue legal obligation review', () => {
      const input = baseInput();
      input.governanceKpis.overdueLegalEvaluationsCount = 1;
      expect(areaOf(assembleComplianceTwin(input), 'governance').band).toBe('red');
    });

    it('is amber when objectives on-track percent is low', () => {
      const input = baseInput();
      input.governanceKpis.objectivesOnTrackPercent = 20;
      expect(areaOf(assembleComplianceTwin(input), 'governance').band).toBe('amber');
    });

    it('is amber when waste non-conformance percent is high', () => {
      const input = baseInput();
      input.governanceKpis.wasteNonConformancePercent = 25;
      expect(areaOf(assembleComplianceTwin(input), 'governance').band).toBe('amber');
    });

    it('treats null percentages as no finding, not zero', () => {
      const input = baseInput();
      input.governanceKpis.objectivesOnTrackPercent = null;
      input.governanceKpis.wasteNonConformancePercent = null;
      expect(areaOf(assembleComplianceTwin(input), 'governance').band).toBe('green');
    });
  });

  describe('risk graph area', () => {
    it('is red when an active assessment relies on an ineffective control', () => {
      const input = baseInput();
      input.riskGraph.assessmentsWithIneffectiveControls = [
        { riskAssessmentId: 'ra1', title: 'Working at height', status: 'active', ineffectiveControlTitles: ['Harness'] },
      ];
      expect(areaOf(assembleComplianceTwin(input), 'risk_graph').band).toBe('red');
    });

    it('is amber on an uncovered hazard, an ineffective shared control, or an unlinked obligation', () => {
      const input = baseInput();
      input.riskGraph.uncoveredHazards = [{ id: 'h1', title: 'Slips' }];
      expect(areaOf(assembleComplianceTwin(input), 'risk_graph').band).toBe('amber');
    });
  });

  describe('incident patterns area', () => {
    it('is red on a fatal or critical incident in the current window', () => {
      const input = baseInput();
      input.incidentPatterns.severityComparison.currentWindow.critical = 1;
      expect(areaOf(assembleComplianceTwin(input), 'incident_patterns').band).toBe('red');
    });

    it('is amber on a recurring root cause, a location cluster, or a worsening major trend', () => {
      const input = baseInput();
      input.incidentPatterns.recurringRootCauses = [{ category: 'process', incidentCount: 3, incidentIds: ['a', 'b', 'c'] }];
      expect(areaOf(assembleComplianceTwin(input), 'incident_patterns').band).toBe('amber');
    });

    it('is amber when major-severity incidents increased versus the prior window', () => {
      const input = baseInput();
      input.incidentPatterns.severityComparison.currentWindow.major = 3;
      input.incidentPatterns.severityComparison.priorWindow.major = 1;
      const a = areaOf(assembleComplianceTwin(input), 'incident_patterns');
      expect(a.band).toBe('amber');
      expect(a.reasons.join(' ')).toContain('increased from 1 to 3');
    });

    it('is not amber when major-severity incidents held steady or fell', () => {
      const input = baseInput();
      input.incidentPatterns.severityComparison.currentWindow.major = 2;
      input.incidentPatterns.severityComparison.priorWindow.major = 2;
      expect(areaOf(assembleComplianceTwin(input), 'incident_patterns').band).toBe('green');
    });
  });

  describe('evidence area', () => {
    it('is red below the 50% coverage threshold', () => {
      const input = baseInput();
      input.evidence.coveragePercent = 40;
      expect(areaOf(assembleComplianceTwin(input), 'evidence').band).toBe('red');
    });

    it('is amber between the 50% and 90% thresholds', () => {
      const input = baseInput();
      input.evidence.coveragePercent = 75;
      expect(areaOf(assembleComplianceTwin(input), 'evidence').band).toBe('amber');
    });

    it('is not red exactly at the 50% threshold', () => {
      const input = baseInput();
      input.evidence.coveragePercent = 50;
      expect(areaOf(assembleComplianceTwin(input), 'evidence').band).toBe('amber');
    });

    it('is not amber exactly at the 90% threshold', () => {
      const input = baseInput();
      input.evidence.coveragePercent = 90;
      expect(areaOf(assembleComplianceTwin(input), 'evidence').band).toBe('green');
    });

    it('treats a null coverage percent (no completions recorded) as green, not a gap', () => {
      const input = baseInput();
      input.evidence.coveragePercent = null;
      input.evidence.totalCompletions = 0;
      input.evidence.completionsWithEvidenceCount = 0;
      expect(areaOf(assembleComplianceTwin(input), 'evidence').band).toBe('green');
    });
  });

  describe('overall band', () => {
    it('is the worst band across all five areas', () => {
      const input = baseInput();
      input.evidence.coveragePercent = 40; // red
      input.riskGraph.uncoveredHazards = [{ id: 'h1', title: 'Slips' }]; // amber
      const snap = assembleComplianceTwin(input);
      expect(snap.overallBand).toBe('red');
    });

    it('is amber when the worst area is amber and nothing is red', () => {
      const input = baseInput();
      input.governanceKpis.wasteNonConformancePercent = 30; // amber
      const snap = assembleComplianceTwin(input);
      expect(snap.overallBand).toBe('amber');
    });

    it('returns exactly five areas, one per source module', () => {
      const snap = assembleComplianceTwin(baseInput());
      expect(snap.areas.map(a => a.area).sort()).toEqual(
        ['evidence', 'governance', 'incident_patterns', 'risk_graph', 'safety'].sort(),
      );
    });
  });
});

describe('adversarial: no redundant reasons within one area', () => {
  it('reports the evidence coverage fact ONCE, not a duplicate red+amber pair, when below the red threshold', () => {
    const input = baseInput();
    input.evidence.coveragePercent = 30; // below both the 50% red and 90% amber thresholds
    const a = areaOf(assembleComplianceTwin(input), 'evidence');
    expect(a.band).toBe('red');
    expect(a.reasons).toHaveLength(1);
  });
});

// Core-OS 360 Completion Programme, Phase 23, Group 5 (closes
// gap-ledger row C12.5): thresholds is an OPTIONAL second parameter —
// undefined/null/unset always falls back to the documented default,
// never silently guessed.
describe('assembleComplianceTwin: per-company threshold overrides', () => {
  it('with no thresholds argument, behaves identically to the pre-Group-5 defaults', () => {
    const input = baseInput(); // lastAuditScore: 85, default threshold 70 -> clean
    const snap = assembleComplianceTwin(input);
    expect(areaOf(snap, 'safety').band).toBe('green');
  });

  it('a stricter audit-score override can turn a previously-clean area amber', () => {
    const input = baseInput(); // lastAuditScore: 85
    const snap = assembleComplianceTwin(input, { auditScoreLowThreshold: 90 });
    const a = areaOf(snap, 'safety');
    expect(a.band).toBe('amber');
    expect(a.reasons[0]).toContain('below the 90% threshold');
  });

  it('a null override falls back to the default, never treated as an explicit 0', () => {
    const input = baseInput();
    const snap = assembleComplianceTwin(input, { auditScoreLowThreshold: null });
    expect(areaOf(snap, 'safety').band).toBe('green'); // 85 is not < the default 70
  });

  it('overrides the evidence red/amber pair independently of governance/objectives thresholds', () => {
    const input = baseInput();
    input.evidence.coveragePercent = 60; // above the default 50% red, below default 90% amber
    const defaultSnap = assembleComplianceTwin(input);
    expect(areaOf(defaultSnap, 'evidence').band).toBe('amber');

    const strictSnap = assembleComplianceTwin(input, { evidenceRedThreshold: 70 });
    expect(areaOf(strictSnap, 'evidence').band).toBe('red');
  });

  it('a looser objectives-on-track threshold can turn a previously-amber area green', () => {
    const input = baseInput();
    input.governanceKpis.objectivesOnTrackPercent = 40; // below the default 50% amber threshold
    const defaultSnap = assembleComplianceTwin(input);
    expect(areaOf(defaultSnap, 'governance').band).toBe('amber');

    const looseSnap = assembleComplianceTwin(input, { objectivesOnTrackAmberThreshold: 30 });
    expect(areaOf(looseSnap, 'governance').band).toBe('green');
  });

  it('a stricter waste-non-conformance threshold can turn a previously-clean area amber', () => {
    const input = baseInput();
    input.governanceKpis.wasteNonConformancePercent = 8; // below the default 10% amber threshold
    const defaultSnap = assembleComplianceTwin(input);
    expect(areaOf(defaultSnap, 'governance').band).toBe('green');

    const strictSnap = assembleComplianceTwin(input, { wasteNonConformanceAmberThreshold: 5 });
    expect(areaOf(strictSnap, 'governance').band).toBe('amber');
  });
});

// Core-OS 360 Completion Programme, Phase 23, Group 6 (closes
// gap-ledger row C12.6): every area exposes `inputs`, the exact raw
// values its own checks read — never a re-derivation, so this must
// track the SAME numbers already driving `reasons`.
describe('assembleComplianceTwin: inputs (C12.6)', () => {
  it('safety.inputs carries the raw values and the threshold ACTUALLY used, post-override', () => {
    const input = baseInput(); // lastAuditScore: 85
    const snap = assembleComplianceTwin(input, { auditScoreLowThreshold: 90 });
    const a = areaOf(snap, 'safety');
    expect(a.inputs).toEqual({
      riddorLast12Months: 0,
      equipmentOverdueCount: 0,
      equipmentDueSoonCount: 0,
      lastAuditScore: 85,
      auditScoreLowThreshold: 90, // the override, not the default 70
    });
  });

  it('evidence.inputs reflects the default thresholds when no override is given', () => {
    const snap = assembleComplianceTwin(baseInput());
    const a = areaOf(snap, 'evidence');
    expect(a.inputs).toEqual({
      coveragePercent: 100,
      evidenceRedThreshold: 50,
      evidenceAmberThreshold: 90,
    });
  });

  it('risk_graph.inputs carries plain counts — this area has no threshold of its own', () => {
    const snap = assembleComplianceTwin(baseInput());
    const a = areaOf(snap, 'risk_graph');
    expect(a.inputs).toEqual({
      assessmentsWithIneffectiveControlsCount: 0,
      uncoveredHazardsCount: 0,
      ineffectiveSharedControlsCount: 0,
      unlinkedApplicableObligationsCount: 0,
    });
  });

  it('every area carries a non-empty inputs object, even when entirely clean', () => {
    const snap = assembleComplianceTwin(baseInput());
    for (const a of snap.areas) {
      expect(Object.keys(a.inputs).length, a.area).toBeGreaterThan(0);
    }
  });
});
