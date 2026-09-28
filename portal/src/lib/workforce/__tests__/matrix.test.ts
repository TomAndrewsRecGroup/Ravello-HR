import { describe, expect, it } from 'vitest';
import { cellLabel, matrixCsvRows, personRequirements, pivotMatrix, requirementKey } from '../matrix';
import type { DeploymentRequirement, MatrixRow } from '../types';

function req(over: Partial<DeploymentRequirement>): DeploymentRequirement {
  return {
    type: 'training', reference_id: 'c1', reference_key: null, name: 'Manual handling', mandatory: true,
    safety_critical: false, status: 'met', detail: null, evidence_date: '2026-01-01', expires_on: '2027-01-01',
    required_by: null, sources: [], ...over,
  };
}
function person(id: string, name: string, requirements: DeploymentRequirement[], over: Partial<MatrixRow> = {}): MatrixRow {
  return {
    person_id: id, full_name: name, worker_type: 'employee', engagement_type: 'permanent', lifecycle_status: 'active',
    primary_role_id: 'r1', site_id: 's1', department_id: 'd1', manager_id: null,
    result: { person_id: id, as_of: '2026-09-28', status: 'READY', computed_at: '', valid_until: null, reasons: [],
      summary: { required: 0, met: 0, unmet: 0, review: 0, conditional: 0, expiring: 0, safety_critical_gap: false }, requirements },
    ...over,
  };
}

const ann = person('p1', 'Ann', [
  req({}),
  req({ type: 'competency', reference_id: 'k1', name: 'Forklift', status: 'unmet', safety_critical: true, expires_on: null }),
  req({ type: 'medical', reference_id: 'm1', name: 'Audiometry', status: 'met_with_restrictions', expires_on: '2027-03-01', detail: 'Fit with restrictions — see occupational health' }),
]);
const bob = person('p2', 'Bob', [
  req({ status: 'expiring', expires_on: '2026-10-10' }),
], { site_id: 's2', department_id: 'd2', manager_id: 'p1', engagement_type: 'contractor', worker_type: 'contractor', primary_role_id: 'r2' });

describe('pivotMatrix', () => {
  it('builds distinct columns across people, ordered by type then name', () => {
    const m = pivotMatrix([ann, bob]);
    expect(m.columns.map(c => c.key)).toEqual(['training:c1', 'competency:k1', 'medical:m1']);
    expect(m.cells.get('p2')?.get('competency:k1')).toBeUndefined(); // not required → blank
    expect(m.cells.get('p1')?.get('competency:k1')?.status).toBe('unmet');
  });

  it('keys a document requirement by its reference_key', () => {
    expect(requirementKey({ type: 'document', reference_id: null, reference_key: 'right_to_work' })).toBe('document:right_to_work');
  });

  it('filters people by site, department, manager and worker type', () => {
    expect(pivotMatrix([ann, bob], { site: 's2' }).rows.map(r => r.full_name)).toEqual(['Bob']);
    expect(pivotMatrix([ann, bob], { department: 'd1' }).rows.map(r => r.full_name)).toEqual(['Ann']);
    expect(pivotMatrix([ann, bob], { manager: 'p1' }).rows.map(r => r.full_name)).toEqual(['Bob']);
    expect(pivotMatrix([ann, bob], { worker: 'contractor' }).rows.map(r => r.full_name)).toEqual(['Bob']);
  });

  it('filters by role through the primary role and active assignments', () => {
    expect(pivotMatrix([ann, bob], { role: 'r2' }).rows.map(r => r.full_name)).toEqual(['Bob']);
    const assigned = new Map([['p1', ['r2']]]);
    expect(pivotMatrix([ann, bob], { role: 'r2' }, assigned).rows.map(r => r.full_name)).toEqual(['Ann', 'Bob']);
  });

  it('narrows columns by requirement type and safety-critical', () => {
    expect(pivotMatrix([ann, bob], { type: 'medical' }).columns.map(c => c.key)).toEqual(['medical:m1']);
    expect(pivotMatrix([ann, bob], { safetyCritical: true }).columns.map(c => c.key)).toEqual(['competency:k1']);
  });

  it('"expiring only" keeps people and columns with an expiring requirement', () => {
    const m = pivotMatrix([ann, bob], { expiring: true });
    expect(m.rows.map(r => r.full_name)).toEqual(['Bob']);
    expect(m.columns.map(c => c.key)).toEqual(['training:c1']);
  });

  it('"expired or not met only" counts unmet and awaiting verification', () => {
    const m = pivotMatrix([ann, bob], { unmet: true });
    expect(m.rows.map(r => r.full_name)).toEqual(['Ann']);
    expect(m.columns.map(c => c.key)).toEqual(['competency:k1']);
  });

  it('never invents a status: a person with no requirements has an empty row', () => {
    const m = pivotMatrix([person('p3', 'Cy', [])]);
    expect(m.rows).toHaveLength(1);
    expect(m.columns).toHaveLength(0);
  });
});

describe('matrixCsvRows', () => {
  it('one row per person × requirement, occupational health as status only', () => {
    const rows = matrixCsvRows(pivotMatrix([ann, bob]));
    expect(rows).toHaveLength(4);
    const med = rows.find(r => r.requirement === 'Audiometry')!;
    expect(med.status).toBe('Met with restrictions');
    expect(med.expires_on).toBe('');
    expect(JSON.stringify(rows)).not.toContain('see occupational health');
    const train = rows.find(r => r.person === 'Ann' && r.requirement === 'Manual handling')!;
    expect(train.expires_on).toBe('2027-01-01');
    expect(rows.find(r => r.requirement === 'Forklift')!.safety_critical).toBe('Yes');
  });
});

describe('cellLabel', () => {
  const m = pivotMatrix([ann]);
  const col = (k: string) => m.columns.find(c => c.key === k)!;
  it('names the person, the requirement, the status and the expiry', () => {
    expect(cellLabel('Ann', col('training:c1'), m.cells.get('p1')!.get('training:c1'), d => d, false))
      .toBe('Ann — Manual handling: Met, expires 2027-01-01');
  });
  it('hides health dates from a viewer without the summary capability', () => {
    expect(cellLabel('Ann', col('medical:m1'), m.cells.get('p1')!.get('medical:m1'), d => d, false))
      .toBe('Ann — Audiometry: Met with restrictions');
    expect(cellLabel('Ann', col('medical:m1'), m.cells.get('p1')!.get('medical:m1'), d => d, true))
      .toContain('expires 2027-03-01');
  });
  it('says "not required" for a blank cell', () => {
    expect(cellLabel('Bob', col('competency:k1'), undefined, d => d, false)).toBe('Bob — Forklift: not required');
  });
});

describe('personRequirements', () => {
  it('lists problems first', () => {
    const list = personRequirements(pivotMatrix([ann]), 'p1');
    expect(list.map(x => x.cell.status)).toEqual(['unmet', 'met_with_restrictions', 'met']);
  });
});

describe('surveillanceRows', () => {
  const o = (over: Partial<import('../matrix').HealthOutcomeRow>) => ({
    id: 'o', person_id: 'p1', requirement_id: 'm1', assessed_on: '2026-01-01', provider: 'OH Ltd', outcome: 'fit',
    restriction_summary: null, review_date: null, created_at: '2026-01-01T10:00:00Z', ...over,
  });
  it('lists each person × medical requirement with the latest outcome', async () => {
    const { surveillanceRows } = await import('../matrix');
    const rows = surveillanceRows([ann, bob], [
      o({ id: 'old', assessed_on: '2025-01-01', outcome: 'unfit' }),
      o({ id: 'new', assessed_on: '2026-02-01', outcome: 'fit_with_restrictions', restriction_summary: 'No work at height', review_date: '2026-08-01' }),
      o({ id: 'same-day-later', assessed_on: '2026-02-01', created_at: '2026-02-01T12:00:00Z', outcome: 'fit' }),
      o({ id: 'other', person_id: 'p2', requirement_id: 'm9' }),
    ]);
    expect(rows).toHaveLength(1); // Bob has no medical requirement; only Ann's audiometry
    expect(rows[0]).toMatchObject({ personName: 'Ann', requirementName: 'Audiometry', status: 'met_with_restrictions' });
    expect(rows[0].latest?.id).toBe('same-day-later');
    expect(rows[0].nextDue).toBe('2027-03-01'); // no review date on the latest → the engine's due date
  });
  it('with no outcome on record, shows the engine status and nothing else', async () => {
    const { surveillanceRows } = await import('../matrix');
    const rows = surveillanceRows([ann], []);
    expect(rows[0].latest).toBeNull();
    expect(rows[0].status).toBe('met_with_restrictions');
  });
});
