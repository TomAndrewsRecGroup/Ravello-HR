import { describe, expect, it } from 'vitest';
import type { DeploymentRequirement, DeploymentResult, MatrixRow } from '../types';
import type { DeploymentStatus, RequirementStatus, RequirementType } from '../vocab';
import { addDays, daysBetween, exceptionProblem, exceptionState, filterMatrix, matrixCsvRows, requirementBuckets,
  summariseMatrix, WORKFORCE_CSV_COLUMNS } from '../dashboard';

function req(type: RequirementType, status: RequirementStatus, detail: string | null = null): DeploymentRequirement {
  return { type, status, detail, reference_id: null, reference_key: null, name: `${type} item`, mandatory: true,
    safety_critical: false, evidence_date: null, expires_on: null, required_by: null, sources: [] };
}

function row(id: string, status: DeploymentStatus, requirements: DeploymentRequirement[] = [], extra: Partial<MatrixRow> = {},
             summary: Partial<DeploymentResult['summary']> = {}): MatrixRow {
  return {
    person_id: id, full_name: `Person ${id}`, worker_type: 'employee', engagement_type: 'permanent', lifecycle_status: 'active',
    primary_role_id: null, site_id: null, department_id: null, manager_id: null,
    result: {
      person_id: id, as_of: '2026-09-28', status, computed_at: '2026-09-28T08:00:00Z', valid_until: null,
      reasons: [{ code: 'unmet', text: `Reason for ${id}` }, { code: 'review', text: 'Second reason' }],
      summary: { required: requirements.length, met: 0, unmet: 0, review: 0, conditional: 0, expiring: 0, safety_critical_gap: false, ...summary },
      requirements, source: 'live',
    },
    ...extra,
  };
}

describe('requirementBuckets', () => {
  it('puts each requirement state in the factual bucket it belongs to', () => {
    expect(requirementBuckets(req('training', 'unmet'))).toEqual(['trainingUnmet']);
    expect(requirementBuckets(req('competency', 'unmet'))).toEqual(['competencyMissing']);
    expect(requirementBuckets(req('licence', 'unmet'))).toEqual(['documentsMissing']);
    expect(requirementBuckets(req('document', 'unmet'))).toEqual(['documentsMissing']);
    expect(requirementBuckets(req('induction', 'unmet'))).toEqual(['inductionIncomplete']);
    expect(requirementBuckets(req('medical', 'unmet'))).toEqual(['healthReviewsDue']);
    expect(requirementBuckets(req('medical', 'expiring'))).toEqual(['expiringSoon', 'healthReviewsDue']);
    expect(requirementBuckets(req('training', 'expiring'))).toEqual(['expiringSoon']);
    expect(requirementBuckets(req('competency', 'review'))).toEqual(['awaitingVerification']);
  });
  it('counts nothing for met, excepted or not-applicable requirements', () => {
    for (const st of ['met', 'excepted', 'not_applicable', 'met_with_restrictions'] as const) {
      expect(requirementBuckets(req('medical', st))).toEqual([]);
      expect(requirementBuckets(req('training', st))).toEqual([]);
    }
  });
});

describe('summariseMatrix', () => {
  it('counts statuses, gaps and requirement buckets by item and by person', () => {
    const rows = [
      row('a', 'READY'),
      row('b', 'NOT_READY', [req('training', 'unmet'), req('training', 'unmet'), req('medical', 'unmet')], {}, { safety_critical_gap: true }),
      row('c', 'CONDITIONALLY_READY', [req('training', 'unmet'), req('competency', 'review')]),
      row('d', 'REVIEW_REQUIRED'),
    ];
    const s = summariseMatrix(rows);
    expect(s.total).toBe(4);
    expect(s.byStatus).toEqual({ READY: 1, CONDITIONALLY_READY: 1, NOT_READY: 1, REVIEW_REQUIRED: 1 });
    expect(s.safetyCriticalGap).toBe(1);
    expect(s.trainingUnmet).toEqual({ items: 3, people: 2 });
    expect(s.healthReviewsDue).toEqual({ items: 1, people: 1 });
    expect(s.awaitingVerification).toEqual({ items: 1, people: 1 });
    expect(s.competencyMissing).toEqual({ items: 0, people: 0 });
  });
  it('never counts a row with a missing or unknown status as Ready', () => {
    const broken = row('x', 'READY');
    (broken.result as unknown as { status: string }).status = 'SOMETHING_ELSE';
    const s = summariseMatrix([broken, { ...row('y', 'READY'), result: undefined as unknown as DeploymentResult }]);
    expect(s.byStatus.READY).toBe(0);
    expect(s.byStatus.REVIEW_REQUIRED).toBe(2);
  });
});

describe('filterMatrix', () => {
  const rows = [
    row('a', 'READY', [], { full_name: 'Alice Smith', site_id: 's1', primary_role_id: 'r1' }),
    row('b', 'NOT_READY', [], { full_name: 'Bob Jones', site_id: 's2', engagement_type: 'agency' }, { safety_critical_gap: true, expiring: 2 }),
  ];
  it('filters by name, status, site, role, engagement, gaps and expiring', () => {
    expect(filterMatrix(rows, { q: 'ali' }).map(r => r.person_id)).toEqual(['a']);
    expect(filterMatrix(rows, { status: 'NOT_READY' }).map(r => r.person_id)).toEqual(['b']);
    expect(filterMatrix(rows, { site: 's1' }).map(r => r.person_id)).toEqual(['a']);
    expect(filterMatrix(rows, { role: 'r1' }).map(r => r.person_id)).toEqual(['a']);
    expect(filterMatrix(rows, { engagement: 'agency' }).map(r => r.person_id)).toEqual(['b']);
    expect(filterMatrix(rows, { scGap: true }).map(r => r.person_id)).toEqual(['b']);
    expect(filterMatrix(rows, { expiring: true }).map(r => r.person_id)).toEqual(['b']);
    expect(filterMatrix(rows, {})).toHaveLength(2);
  });
});

describe('matrixCsvRows', () => {
  it('exports counts and reason text only, never requirement detail', () => {
    const r = row('a', 'NOT_READY', [req('medical', 'unmet', 'CLINICAL-DETAIL-SHOULD-NOT-APPEAR')], { primary_role_id: 'r1' },
      { required: 3, met: 1, unmet: 1, review: 1, expiring: 0, safety_critical_gap: true });
    const [out] = matrixCsvRows([r], { roles: new Map([['r1', 'Forklift driver']]), sites: new Map(), departments: new Map() });
    expect(out.status).toBe('Not ready');
    expect(out.role).toBe('Forklift driver');
    expect(out.reasons).toBe('Reason for a; Second reason');
    expect(out.safety_critical_gap).toBe('Yes');
    expect(out.required).toBe(3);
    expect(JSON.stringify(out)).not.toContain('CLINICAL-DETAIL');
    expect(Object.keys(out).sort()).toEqual(WORKFORCE_CSV_COLUMNS.map(c => c.key).sort());
  });
});

describe('exceptions', () => {
  const today = '2026-09-28';
  it('mirrors the 134 limits', () => {
    const ok = { reason: 'Course booked for next week', validFrom: today, validUntil: addDays(today, 90), today };
    expect(exceptionProblem(ok)).toBeNull();
    expect(exceptionProblem({ ...ok, reason: 'too short' })).toMatch(/10 characters/);
    expect(exceptionProblem({ ...ok, validUntil: addDays(today, 91) })).toMatch(/90 days/);
    expect(exceptionProblem({ ...ok, validFrom: '2026-09-27' })).toMatch(/past/);
    expect(exceptionProblem({ ...ok, validUntil: '2026-09-27' })).toMatch(/on or after/);
    expect(exceptionProblem({ ...ok, validUntil: '' })).toMatch(/Choose/);
  });
  it('counts days across month ends', () => {
    expect(daysBetween('2026-09-28', '2026-12-27')).toBe(90);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('states where an exception stands by date alone', () => {
    const e = { valid_from: '2026-09-01', valid_until: '2026-10-01', revoked_at: null };
    expect(exceptionState(e, today)).toBe('in_force');
    expect(exceptionState(e, '2026-10-02')).toBe('lapsed');
    expect(exceptionState(e, '2026-08-31')).toBe('scheduled');
    expect(exceptionState({ ...e, revoked_at: '2026-09-20T10:00:00Z' }, today)).toBe('revoked');
    expect(exceptionState({ ...e, revoked_at: '2026-09-29T10:00:00Z' }, today)).toBe('in_force');
  });
});
