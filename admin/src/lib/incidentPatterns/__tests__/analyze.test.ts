import { describe, expect, it } from 'vitest';
import { analyzeIncidentPatterns, type IncidentPatternInput, type IncidentRow } from '../analyze';

function inc(over: Partial<IncidentRow> & { id: string }): IncidentRow {
  return { incident_type: 'accident', severity: null, site_id: null, department_id: null, occurred_on: '2026-09-01', ...over };
}
function base(): IncidentPatternInput {
  return { incidents: [], causes: [], investigations: [], priorWindowIncidents: [] };
}

describe('analyzeIncidentPatterns', () => {
  it('returns an empty, all-zero summary for no incidents', () => {
    const out = analyzeIncidentPatterns(base());
    expect(out.totalIncidents).toBe(0);
    expect(out.byType).toEqual([]);
    expect(out.recurringRootCauses).toEqual([]);
    expect(out.siteClusters).toEqual([]);
    expect(out.departmentClusters).toEqual([]);
    expect(out.severityComparison).toEqual({ currentWindow: { major: 0, critical: 0, fatal: 0 }, priorWindow: { major: 0, critical: 0, fatal: 0 } });
  });

  it('counts incidents by type, most frequent first', () => {
    const out = analyzeIncidentPatterns({
      ...base(),
      incidents: [
        inc({ id: 'i1', incident_type: 'near_miss' }), inc({ id: 'i2', incident_type: 'near_miss' }), inc({ id: 'i3', incident_type: 'near_miss' }),
        inc({ id: 'i4', incident_type: 'injury' }),
      ],
    });
    expect(out.totalIncidents).toBe(4);
    expect(out.byType).toEqual([{ incidentType: 'near_miss', count: 3 }, { incidentType: 'injury', count: 1 }]);
  });

  it('flags a root cause category shared by 2+ DISTINCT incidents in the window, and only confirmed root causes', () => {
    const out = analyzeIncidentPatterns({
      incidents: [inc({ id: 'i1' }), inc({ id: 'i2' })],
      investigations: [{ id: 'v1', incident_id: 'i1' }, { id: 'v2', incident_id: 'i2' }],
      causes: [
        { investigation_id: 'v1', cause_level: 'root', category: 'maintenance', confirmed_at: '2026-09-02T00:00:00Z' },
        { investigation_id: 'v2', cause_level: 'root', category: 'maintenance', confirmed_at: '2026-09-03T00:00:00Z' },
      ],
      priorWindowIncidents: [],
    });
    expect(out.recurringRootCauses).toEqual([{ category: 'maintenance', incidentCount: 2, incidentIds: expect.arrayContaining(['i1', 'i2']) }]);
  });

  it('never flags an unconfirmed cause, even shared across incidents', () => {
    const out = analyzeIncidentPatterns({
      incidents: [inc({ id: 'i1' }), inc({ id: 'i2' })],
      investigations: [{ id: 'v1', incident_id: 'i1' }, { id: 'v2', incident_id: 'i2' }],
      causes: [
        { investigation_id: 'v1', cause_level: 'root', category: 'maintenance', confirmed_at: null },
        { investigation_id: 'v2', cause_level: 'root', category: 'maintenance', confirmed_at: null },
      ],
      priorWindowIncidents: [],
    });
    expect(out.recurringRootCauses).toEqual([]);
  });

  it('never counts an immediate or underlying cause towards a recurring ROOT cause', () => {
    const out = analyzeIncidentPatterns({
      incidents: [inc({ id: 'i1' }), inc({ id: 'i2' })],
      investigations: [{ id: 'v1', incident_id: 'i1' }, { id: 'v2', incident_id: 'i2' }],
      causes: [
        { investigation_id: 'v1', cause_level: 'immediate', category: 'maintenance', confirmed_at: '2026-09-02T00:00:00Z' },
        { investigation_id: 'v2', cause_level: 'underlying', category: 'maintenance', confirmed_at: '2026-09-03T00:00:00Z' },
      ],
      priorWindowIncidents: [],
    });
    expect(out.recurringRootCauses).toEqual([]);
  });

  it('a cause on an incident OUTSIDE the window does not inflate this window\'s count', () => {
    const out = analyzeIncidentPatterns({
      incidents: [inc({ id: 'i1' })],
      investigations: [{ id: 'v1', incident_id: 'i1' }, { id: 'v2', incident_id: 'outside-window' }],
      causes: [
        { investigation_id: 'v1', cause_level: 'root', category: 'maintenance', confirmed_at: '2026-09-02T00:00:00Z' },
        { investigation_id: 'v2', cause_level: 'root', category: 'maintenance', confirmed_at: '2026-09-03T00:00:00Z' },
      ],
      priorWindowIncidents: [],
    });
    expect(out.recurringRootCauses).toEqual([]);
  });

  it('flags a site with 2+ incidents in the window as a cluster, never fewer', () => {
    const out = analyzeIncidentPatterns({
      ...base(),
      incidents: [inc({ id: 'i1', site_id: 's1' }), inc({ id: 'i2', site_id: 's1' }), inc({ id: 'i3', site_id: 's2' })],
    });
    expect(out.siteClusters).toEqual([{ kind: 'site', id: 's1', count: 2 }]);
  });

  it('flags a department with 2+ incidents the same way', () => {
    const out = analyzeIncidentPatterns({
      ...base(),
      incidents: [inc({ id: 'i1', department_id: 'd1' }), inc({ id: 'i2', department_id: 'd1' })],
    });
    expect(out.departmentClusters).toEqual([{ kind: 'department', id: 'd1', count: 2 }]);
  });

  it('never counts an incident with no site_id/department_id into either cluster list', () => {
    const out = analyzeIncidentPatterns({
      ...base(),
      incidents: [inc({ id: 'i1' }), inc({ id: 'i2' })],
    });
    expect(out.siteClusters).toEqual([]);
    expect(out.departmentClusters).toEqual([]);
  });

  it('compares major/critical/fatal counts between the current and prior window, never merging them', () => {
    const out = analyzeIncidentPatterns({
      incidents: [inc({ id: 'i1', severity: 'major' }), inc({ id: 'i2', severity: 'fatal' })],
      causes: [], investigations: [],
      priorWindowIncidents: [inc({ id: 'p1', severity: 'critical' })],
    });
    expect(out.severityComparison).toEqual({
      currentWindow: { major: 1, critical: 0, fatal: 1 },
      priorWindow: { major: 0, critical: 1, fatal: 0 },
    });
  });

  it('never counts minor/moderate/serious/null severity in the comparison', () => {
    const out = analyzeIncidentPatterns({
      ...base(),
      incidents: [inc({ id: 'i1', severity: 'minor' }), inc({ id: 'i2', severity: null }), inc({ id: 'i3', severity: 'serious' })],
    });
    expect(out.severityComparison.currentWindow).toEqual({ major: 0, critical: 0, fatal: 0 });
  });
});
