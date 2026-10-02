import { describe, expect, it } from 'vitest';
import { computeContinuousImprovement, incidentPatternWindows, type AuditFindingRow, type ObjectiveRow } from '../analyze';
import type { IncidentPatternInput } from '../../incidentPatterns/analyze';

const EMPTY_INCIDENT_INPUT: IncidentPatternInput = { incidents: [], causes: [], investigations: [], priorWindowIncidents: [] };

function finding(over: Partial<AuditFindingRow> & { id: string }): AuditFindingRow {
  return { severity: 'minor', created_at: '2026-09-15T00:00:00Z', closed_at: null, ...over };
}

function objective(id: string, status: ObjectiveRow['status']): ObjectiveRow {
  return { id, status };
}

const w = incidentPatternWindows('2026-09-29', 30);

describe('computeContinuousImprovement: audit findings trend', () => {
  it('counts raised and closed separately per window, and never confuses the two', () => {
    const out = computeContinuousImprovement({
      ...w,
      auditFindings: [
        finding({ id: 'a1', created_at: w.windowStart, closed_at: null }), // raised current, still open
        finding({ id: 'a2', created_at: w.priorStart, closed_at: w.windowStart }), // raised prior, closed current
      ],
      objectives: [],
      incidentPatternInput: EMPTY_INCIDENT_INPUT,
    });
    expect(out.auditFindings.currentWindow.raised).toBe(1);
    expect(out.auditFindings.currentWindow.closed).toBe(1);
    expect(out.auditFindings.priorWindow.raised).toBe(1);
    expect(out.auditFindings.priorWindow.closed).toBe(0);
  });

  it('openNow is a point-in-time fact, unaffected by the window', () => {
    const out = computeContinuousImprovement({
      ...w,
      auditFindings: [
        finding({ id: 'a1', created_at: '2020-01-01T00:00:00Z', closed_at: null }), // ancient, still open
        finding({ id: 'a2', created_at: '2020-01-01T00:00:00Z', closed_at: '2020-02-01T00:00:00Z' }),
      ],
      objectives: [],
      incidentPatternInput: EMPTY_INCIDENT_INPUT,
    });
    expect(out.auditFindings.openNow).toBe(1);
  });

  it('computes the average days-to-close ONLY for findings closed in the current window', () => {
    const out = computeContinuousImprovement({
      ...w,
      auditFindings: [
        finding({ id: 'a1', created_at: w.priorStart, closed_at: w.windowStart }),
      ],
      objectives: [],
      incidentPatternInput: EMPTY_INCIDENT_INPUT,
    });
    expect(out.auditFindings.currentWindow.avgDaysToCloseClosed).not.toBeNull();
    expect(out.auditFindings.currentWindow.avgDaysToCloseClosed).toBeGreaterThan(0);
  });

  it('avgDaysToCloseClosed is null, never zero, when nothing closed in the current window', () => {
    const out = computeContinuousImprovement({
      ...w,
      auditFindings: [finding({ id: 'a1', created_at: w.windowStart, closed_at: null })],
      objectives: [],
      incidentPatternInput: EMPTY_INCIDENT_INPUT,
    });
    expect(out.auditFindings.currentWindow.avgDaysToCloseClosed).toBeNull();
  });
});

describe('computeContinuousImprovement: objectives', () => {
  it('buckets every status, including ones with zero objectives', () => {
    const out = computeContinuousImprovement({
      ...w,
      auditFindings: [],
      objectives: [objective('o1', 'on_track'), objective('o2', 'at_risk')],
      incidentPatternInput: EMPTY_INCIDENT_INPUT,
    });
    expect(out.objectives.byStatus).toMatchObject({ on_track: 1, at_risk: 1, achieved: 0, missed: 0, draft: 0, abandoned: 0, active: 0 });
  });

  it('healthyPercent excludes draft/abandoned from the denominator', () => {
    const out = computeContinuousImprovement({
      ...w,
      auditFindings: [],
      objectives: [objective('o1', 'on_track'), objective('o2', 'draft'), objective('o3', 'abandoned')],
      incidentPatternInput: EMPTY_INCIDENT_INPUT,
    });
    // 1 healthy (on_track) / 1 in-flight (on_track) = 100%, draft/abandoned excluded entirely.
    expect(out.objectives.healthyPercent).toBe(100);
  });

  it('healthyPercent is null, never zero, when there are no in-flight objectives at all', () => {
    const out = computeContinuousImprovement({
      ...w,
      auditFindings: [],
      objectives: [objective('o1', 'draft')],
      incidentPatternInput: EMPTY_INCIDENT_INPUT,
    });
    expect(out.objectives.healthyPercent).toBeNull();
  });

  it('achieved counts as healthy alongside on_track', () => {
    const out = computeContinuousImprovement({
      ...w,
      auditFindings: [],
      objectives: [objective('o1', 'achieved'), objective('o2', 'missed')],
      incidentPatternInput: EMPTY_INCIDENT_INPUT,
    });
    expect(out.objectives.healthyPercent).toBe(50);
  });
});

describe('computeContinuousImprovement: recurring root causes', () => {
  it('reuses analyzeIncidentPatterns verbatim rather than re-deriving the grouping', () => {
    const incidentPatternInput: IncidentPatternInput = {
      incidents: [
        { id: 'i1', incident_type: 'slip', severity: 'major', site_id: null, department_id: null, occurred_on: w.windowStart.slice(0, 10) },
        { id: 'i2', incident_type: 'slip', severity: 'major', site_id: null, department_id: null, occurred_on: w.windowStart.slice(0, 10) },
      ],
      investigations: [{ id: 'v1', incident_id: 'i1' }, { id: 'v2', incident_id: 'i2' }],
      causes: [
        { investigation_id: 'v1', cause_level: 'root', category: 'training', confirmed_at: '2026-09-20T00:00:00Z' },
        { investigation_id: 'v2', cause_level: 'root', category: 'training', confirmed_at: '2026-09-20T00:00:00Z' },
      ],
      priorWindowIncidents: [],
    };
    const out = computeContinuousImprovement({ ...w, auditFindings: [], objectives: [], incidentPatternInput });
    expect(out.recurringRootCauses).toEqual([{ category: 'training', incidentCount: 2, incidentIds: expect.arrayContaining(['i1', 'i2']) }]);
  });
});
