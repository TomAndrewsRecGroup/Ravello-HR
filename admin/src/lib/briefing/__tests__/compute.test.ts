import { describe, it, expect } from 'vitest';
import { assembleDailyBriefing, type BriefingSnapshotRow } from '../compute';

function row(overrides: Partial<BriefingSnapshotRow> = {}): BriefingSnapshotRow {
  return {
    company_id: 'co-1',
    band: 'green',
    overdue_comp: 0,
    open_tickets: 0,
    stalled_reqs: 0,
    open_critical_actions: 0,
    overdue_legal_evaluations: 0,
    overdue_controlled_documents: 0,
    open_incident_investigations: 0,
    safety_critical_gaps: 0,
    workers_not_ready: 0,
    assets_unavailable: 0,
    major_audit_findings: 0,
    contractor_expiring: 0,
    environmental_permits_expiring: 0,
    management_reviews_due: 0,
    outstanding_service_requests: 0,
    next_consultant_visit_date: null,
    ...overrides,
  };
}

const NAMES = new Map([['co-1', 'Acme Ltd'], ['co-2', 'Old Albanians Rugby']]);

describe('assembleDailyBriefing', () => {
  it('reports a fully clean portfolio with no flags', () => {
    const b = assembleDailyBriefing('2026-10-02', [row()], NAMES);
    expect(b.flags).toHaveLength(0);
    expect(b.cleanCompanies).toBe(1);
    expect(b.redCompanies).toBe(0);
  });

  it('flags a safety-critical gap as critical severity', () => {
    const b = assembleDailyBriefing('2026-10-02', [row({ safety_critical_gaps: 2 })], NAMES);
    expect(b.flags).toHaveLength(1);
    expect(b.flags[0].severity).toBe('critical');
    expect(b.flags[0].reason).toContain('2 safety-critical');
  });

  it('reports workers_not_ready independently of safety_critical_gaps — never hides the broader count behind the narrower one', () => {
    // The exact Phase 27 adversarial-QA lesson (People domain bug):
    // these are two independently-derived counts, never a guaranteed
    // subset relationship, so both must surface even when both fire.
    const b = assembleDailyBriefing('2026-10-02', [row({ safety_critical_gaps: 1, workers_not_ready: 5 })], NAMES);
    const keys = b.flags.map(f => f.key);
    expect(keys).toContain('safety_critical_gaps');
    expect(keys).toContain('workers_not_ready');
    expect(b.flags).toHaveLength(2);
  });

  it('assets_unavailable is warning at 1-2 and critical at 3+', () => {
    const warn = assembleDailyBriefing('2026-10-02', [row({ assets_unavailable: 2 })], NAMES);
    expect(warn.flags[0].severity).toBe('warning');
    const crit = assembleDailyBriefing('2026-10-02', [row({ assets_unavailable: 3 })], NAMES);
    expect(crit.flags[0].severity).toBe('critical');
  });

  it('sorts critical flags before warnings, then by count descending', () => {
    const b = assembleDailyBriefing('2026-10-02', [
      row({ company_id: 'co-1', overdue_comp: 10 }),
      row({ company_id: 'co-2', open_critical_actions: 1 }),
    ], NAMES);
    expect(b.flags[0].severity).toBe('critical');
    expect(b.flags[0].companyId).toBe('co-2');
  });

  it('counts red/amber/clean bands across the portfolio', () => {
    const b = assembleDailyBriefing('2026-10-02', [
      row({ company_id: 'co-1', band: 'red' }),
      row({ company_id: 'co-2', band: 'amber' }),
    ], NAMES);
    expect(b.redCompanies).toBe(1);
    expect(b.amberCompanies).toBe(1);
  });

  it('sums each named signal across the whole portfolio into totals', () => {
    const b = assembleDailyBriefing('2026-10-02', [
      row({ company_id: 'co-1', overdue_legal_evaluations: 3 }),
      row({ company_id: 'co-2', overdue_legal_evaluations: 2 }),
    ], NAMES);
    expect(b.totals.overdue_legal_evaluations).toBe(5);
  });

  it('resolves company names from the supplied map, falling back when absent', () => {
    const b = assembleDailyBriefing('2026-10-02', [row({ company_id: 'co-unknown', stalled_reqs: 1 })], NAMES);
    expect(b.flags[0].companyName).toBe('Unknown client');
  });

  it('ranks the company summary list by critical count, then total flag count', () => {
    const b = assembleDailyBriefing('2026-10-02', [
      row({ company_id: 'co-1', overdue_comp: 1 }),
      row({ company_id: 'co-2', major_audit_findings: 1 }),
    ], NAMES);
    expect(b.companies[0].companyId).toBe('co-2');
    expect(b.companies[0].criticalCount).toBe(1);
  });
});
