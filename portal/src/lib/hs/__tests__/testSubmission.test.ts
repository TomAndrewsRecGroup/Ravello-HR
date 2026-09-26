import { beforeEach, describe, expect, it, vi } from 'vitest';

// submitBuiltInTest is the one place a built_in test marks itself; the
// DB trigger (hs_test_submission_fill) recomputes `passed` for real,
// but this unit test exercises the pure marking/sanitising path this
// function is responsible for around that insert.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const burned: string[] = [];

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'delete' = 'select';
  let single: 'maybe' | 'single' | null = null; let payload: Row[] = [];
  const q: any = {
    select() { return q; },
    insert(rows: Row | Row[]) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return q; },
    delete() { op = 'delete'; return q; },
    eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q; },
    neq(c: string, v: unknown) { filters.push(r => r[c] !== v); return q; },
    maybeSingle() { single = 'maybe'; return q; },
    single() { single = 'single'; return q; },
    then(res: any, rej?: any) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    const rows = (tables[name] ??= []);
    if (op === 'select') {
      const hit = rows.filter(r => filters.every(f => f(r)));
      if (single === 'single') return { data: hit[0] ?? null, error: hit[0] ? null : { message: 'no rows' } };
      return { data: single === 'maybe' ? hit[0] ?? null : hit, error: null };
    }
    if (op === 'insert') {
      // Mimic the trigger: a built_in submission's `passed` is derived from score >= pass_mark.
      const test = tables.hs_tests?.[0];
      const inserted = payload.map(r => ({ id: `sub-${rows.length + 1}`, ...r, passed: test?.pass_mark != null && r.score >= test.pass_mark }));
      rows.push(...inserted);
      return { data: single === 'single' ? inserted[0] : inserted, error: null };
    }
    const hit = rows.filter(r => filters.every(f => f(r)));
    if (hit.length) burned.push(...hit.map(r => r.token_hash));
    tables[name] = rows.filter(r => !hit.includes(r));
    return { data: null, error: null };
  }
  return q;
}
const sb: any = { from: (t: string) => builder(t) };

const { submitBuiltInTest } = await import('../testSubmission');

const QUESTIONS = [
  { id: 'q1', prompt: 'Q1', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correct_option_id: 'a' },
  { id: 'q2', prompt: 'Q2', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correct_option_id: 'b' },
];

beforeEach(() => {
  burned.length = 0;
  tables = {
    hs_test_assignments: [{ id: 'a1', status: 'pending', test_id: 't1' }],
    hs_tests: [{ id: 't1', source_type: 'built_in', questions: QUESTIONS, pass_mark: 70 }],
    hs_test_submissions: [],
    hs_test_tokens: [{ token_hash: 'tok-1', assignment_id: 'a1' }, { token_hash: 'tok-2', assignment_id: 'other' }],
  };
});

describe('submitBuiltInTest', () => {
  it('scores the answers, inserts the submission, and burns every token for this assignment', async () => {
    const r = await submitBuiltInTest(sb, 'a1', { q1: 'a', q2: 'b' });
    expect(r).toMatchObject({ outcome: 'submitted', score: 100, correctCount: 2, totalCount: 2, passed: true });
    expect(tables.hs_test_submissions).toHaveLength(1);
    expect(tables.hs_test_submissions[0]).toMatchObject({ assignment_id: 'a1', score: 100, answers: { q1: 'a', q2: 'b' } });
    expect(burned).toEqual(['tok-1']);
    expect(tables.hs_test_tokens).toEqual([{ token_hash: 'tok-2', assignment_id: 'other' }]);
  });

  it('a garbage answer naming no real option marks as wrong, never throws', async () => {
    const r = await submitBuiltInTest(sb, 'a1', { q1: 'not-a-real-option', q2: 'b' });
    expect(r).toMatchObject({ outcome: 'submitted', score: 50, correctCount: 1 });
    expect(tables.hs_test_submissions[0].answers).toEqual({ q2: 'b' });
  });

  it('an already-completed assignment is refused, and nothing is inserted', async () => {
    tables.hs_test_assignments[0].status = 'completed';
    const r = await submitBuiltInTest(sb, 'a1', {});
    expect(r).toEqual({ outcome: 'already' });
    expect(tables.hs_test_submissions).toHaveLength(0);
  });

  it('a non-built_in test is refused — that one is never self-submitted here', async () => {
    tables.hs_tests[0].source_type = 'manual';
    const r = await submitBuiltInTest(sb, 'a1', {});
    expect(r).toEqual({ outcome: 'not_built_in' });
    expect(tables.hs_test_submissions).toHaveLength(0);
  });

  it('an unknown assignment is refused', async () => {
    const r = await submitBuiltInTest(sb, 'nope', {});
    expect(r).toEqual({ outcome: 'not_found' });
  });
});
