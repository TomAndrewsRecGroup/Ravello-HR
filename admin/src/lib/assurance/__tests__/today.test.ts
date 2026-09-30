import { describe, expect, it } from 'vitest';
import { assembleAssuranceToday } from '../today';
import type { PortfolioCounts } from '@/lib/health/portfolioCounts';
import type { ComplianceTwinSnapshot } from '@/lib/complianceTwin/assemble';

const CLEAN_COUNTS: PortfolioCounts = {
  open_critical_actions: 0, overdue_legal_evaluations: 0, overdue_controlled_documents: 0,
  open_incident_investigations: 0, safety_critical_gaps: 0, workers_not_ready: 0,
  assets_unavailable: 0, major_audit_findings: 0, contractor_expiring: 0,
  environmental_permits_expiring: 0, management_reviews_due: 0, outstanding_service_requests: 0,
  next_consultant_visit_date: null,
};

const GREEN_TWIN: ComplianceTwinSnapshot = {
  overallBand: 'green',
  areas: [
    { area: 'safety', label: 'Safety (H&S)', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'governance', label: 'Governance & Environmental', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'risk_graph', label: 'Risk Graph', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'incident_patterns', label: 'Incident Patterns', band: 'green', reasons: ['clean'], inputs: {} },
    { area: 'evidence', label: 'Evidence Coverage', band: 'green', reasons: ['clean'], inputs: {} },
  ],
};

const NOW = new Date('2026-09-30T08:00:00Z');

describe('assembleAssuranceToday', () => {
  it('is clear with no headline items when every count is zero and the twin is green', () => {
    const out = assembleAssuranceToday(CLEAN_COUNTS, GREEN_TWIN, NOW);
    expect(out.band).toBe('clear');
    expect(out.items).toEqual([]);
    expect(out.headline).toMatch(/no items are currently flagged/i);
    // "safety" (the domain noun) is fine — only "safe"/"compliant" used
    // as a standalone verdict word would violate the absolute rule.
    expect(out.headline.toLowerCase()).not.toMatch(/\bsafe\b/);
    expect(out.headline.toLowerCase()).not.toContain('compliant');
  });

  it('is urgent when a high-severity count is present, even with a green twin', () => {
    const counts = { ...CLEAN_COUNTS, workers_not_ready: 2 };
    const out = assembleAssuranceToday(counts, GREEN_TWIN, NOW);
    expect(out.band).toBe('urgent');
    expect(out.items).toEqual([{ key: 'workers_not_ready', label: 'Workers not currently Safe to Deploy', count: 2, severity: 'high' }]);
  });

  it('is attention (not urgent) when only medium-severity counts are present', () => {
    const counts = { ...CLEAN_COUNTS, major_audit_findings: 1 };
    const out = assembleAssuranceToday(counts, GREEN_TWIN, NOW);
    expect(out.band).toBe('attention');
  });

  it('a red twin alone (zero operational counts) still forces urgent', () => {
    const redTwin: ComplianceTwinSnapshot = { ...GREEN_TWIN, overallBand: 'red' };
    const out = assembleAssuranceToday(CLEAN_COUNTS, redTwin, NOW);
    expect(out.band).toBe('urgent');
    expect(out.items).toEqual([]);
  });

  it('an amber twin alone still forces at least attention', () => {
    const amberTwin: ComplianceTwinSnapshot = { ...GREEN_TWIN, overallBand: 'amber' };
    const out = assembleAssuranceToday(CLEAN_COUNTS, amberTwin, NOW);
    expect(out.band).toBe('attention');
  });

  it('never includes a zero count in the items list', () => {
    const counts = { ...CLEAN_COUNTS, workers_not_ready: 0, assets_unavailable: 3 };
    const out = assembleAssuranceToday(counts, GREEN_TWIN, NOW);
    expect(out.items.map(i => i.key)).toEqual(['assets_unavailable']);
  });

  it('sorts high-severity items before medium, tie-broken alphabetically by key', () => {
    const counts = { ...CLEAN_COUNTS, overdue_legal_evaluations: 1, assets_unavailable: 1, safety_critical_gaps: 1, major_audit_findings: 1 };
    const out = assembleAssuranceToday(counts, GREEN_TWIN, NOW);
    expect(out.items.map(i => i.key)).toEqual(['assets_unavailable', 'safety_critical_gaps', 'major_audit_findings', 'overdue_legal_evaluations']);
  });

  it('uses correct singular grammar for exactly one item in one area', () => {
    const counts = { ...CLEAN_COUNTS, workers_not_ready: 1 };
    const out = assembleAssuranceToday(counts, GREEN_TWIN, NOW);
    expect(out.headline).toBe('1 item across 1 area currently needs attention.');
  });

  it('uses correct plural grammar for multiple items across multiple areas', () => {
    const counts = { ...CLEAN_COUNTS, workers_not_ready: 2, assets_unavailable: 1 };
    const out = assembleAssuranceToday(counts, GREEN_TWIN, NOW);
    expect(out.headline).toBe('3 items across 2 areas currently need attention.');
  });

  it('carries the twin through unchanged and stamps asOf from the given now', () => {
    const out = assembleAssuranceToday(CLEAN_COUNTS, GREEN_TWIN, NOW);
    expect(out.twin).toBe(GREEN_TWIN);
    expect(out.asOf).toBe(NOW.toISOString());
  });
});
