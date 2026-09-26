import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashAccessToken } from '@/lib/auth/accessTokens';

// The public test-taking route: GET returns who/what without the
// answer key; POST only ever completes a built_in test, marking it
// itself and emitting the event the admin app's hs_test_submission_recorded
// rule turns into a client notification. Drives the real handlers
// against a small stateful fake — same shape as the policy route test.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const emitted: any[] = [];

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
  let patch: Row = {}; let single: 'maybe' | 'single' | null = null; let payload: Row[] = [];
  const q: any = {
    select() { return q; },
    insert(rows: Row | Row[]) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return q; },
    update(p: Row) { op = 'update'; patch = p; return q; },
    delete() { op = 'delete'; return q; },
    eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q; },
    neq(c: string, v: unknown) { filters.push(r => r[c] !== v); return q; },
    in(c: string, vs: unknown[]) { filters.push(r => vs.includes(r[c])); return q; },
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
      const inserted = payload.map(r => ({ id: r.id ?? `${name}-${rows.length + 1}`, ...r }));
      rows.push(...inserted);
      return { data: single ? inserted[0] : inserted, error: null };
    }
    const hit = rows.filter(r => filters.every(f => f(r)));
    if (op === 'delete') { tables[name] = rows.filter(r => !hit.includes(r)); return { data: null, error: null }; }
    hit.forEach(r => Object.assign(r, patch));
    return { data: null, error: null };
  }
  return q;
}
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/rateLimit', () => ({ createRateLimiter: () => ({ check: () => ({ allowed: true, resetAt: 0 }) }), getRateLimitKey: () => 'ip' }));
vi.mock('@/lib/events/emit', () => ({ emitEvent: async (_sb: unknown, input: unknown) => { emitted.push(input); return { error: null }; } }));

const { GET, POST } = await import('../route');
const TOKEN = '11111111-2222-4333-8444-555555555555';
const req = (method: string, token: string, body?: unknown) => new NextRequest(`https://portal.example.com/api/test/${token}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });

const QUESTIONS = [
  { id: 'q1', prompt: 'Where should you assemble in a fire?', options: [{ id: 'a', label: 'Car park' }, { id: 'b', label: 'Stay put' }], correct_option_id: 'a' },
  { id: 'q2', prompt: 'How often is the alarm tested?', options: [{ id: 'a', label: 'Weekly' }, { id: 'b', label: 'Never' }], correct_option_id: 'a' },
];

beforeEach(async () => {
  emitted.length = 0;
  tables = {
    hs_test_tokens: [{ token_hash: await hashAccessToken(TOKEN), assignment_id: 'a1', expires_at: '2099-01-01T00:00:00Z' }],
    hs_test_assignments: [{ id: 'a1', status: 'pending', test_id: 't1', employee_id: 'emp-1', company_id: 'co-1' }],
    hs_tests: [{ id: 't1', title: 'Fire Warden Refresher', description: 'Annual refresher', source_type: 'built_in', external_url: null, pass_mark: 70, questions: QUESTIONS }],
    employee_records: [{ id: 'emp-1', full_name: 'Jordan Lee', status: 'active' }],
    companies: [{ id: 'co-1', name: 'Sample Co' }],
    hs_test_submissions: [],
  };
});

describe('GET /api/test/[token]', () => {
  it('returns who/what and the questions with no answer key', async () => {
    const res = await GET(req('GET', TOKEN), ctx(TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.employee).toEqual({ name: 'Jordan Lee' });
    expect(body.company).toEqual({ name: 'Sample Co' });
    expect(body.test.source_type).toBe('built_in');
    expect(body.test.questions).toEqual([
      { id: 'q1', prompt: 'Where should you assemble in a fire?', options: [{ id: 'a', label: 'Car park' }, { id: 'b', label: 'Stay put' }] },
      { id: 'q2', prompt: 'How often is the alarm tested?', options: [{ id: 'a', label: 'Weekly' }, { id: 'b', label: 'Never' }] },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/correct_option_id/);
  });

  it('an external/manual test has no questions, only the source and (for link/ms_forms) a URL', async () => {
    tables.hs_tests[0] = { ...tables.hs_tests[0], source_type: 'link', external_url: 'https://forms.example/quiz', questions: null };
    const body = await (await GET(req('GET', TOKEN), ctx(TOKEN))).json();
    expect(body.test).toMatchObject({ source_type: 'link', external_url: 'https://forms.example/quiz', questions: null });
  });

  it('refuses a malformed, unknown or expired link, and a leaver', async () => {
    expect((await GET(req('GET', 'nope'), ctx('nope'))).status).toBe(404);
    const other = '99999999-2222-4333-8444-555555555555';
    expect((await GET(req('GET', other), ctx(other))).status).toBe(404);
    tables.hs_test_tokens[0].expires_at = '2020-01-01T00:00:00Z';
    expect((await GET(req('GET', TOKEN), ctx(TOKEN))).status).toBe(410);
    tables.hs_test_tokens[0].expires_at = '2099-01-01T00:00:00Z';
    tables.employee_records[0].status = 'terminated';
    expect((await GET(req('GET', TOKEN), ctx(TOKEN))).status).toBe(410);
  });
});

describe('POST /api/test/[token]', () => {
  it('marks a built_in test itself, records the submission, burns the link and emits the event for the client notification', async () => {
    const res = await POST(req('POST', TOKEN, { answers: { q1: 'a', q2: 'a' } }), ctx(TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, score: 100, correctCount: 2, totalCount: 2 });
    expect(tables.hs_test_submissions).toHaveLength(1);
    expect(tables.hs_test_submissions[0]).toMatchObject({ assignment_id: 'a1', score: 100, answers: { q1: 'a', q2: 'a' } });
    expect(tables.hs_test_tokens).toHaveLength(0);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      companyId: 'co-1', entityType: 'hs_test_submission', entityId: 'a1', eventType: 'created', actorKind: 'client',
      dedupeKey: 'hs_test_submission:a1',
      payload: { employee_name: 'Jordan Lee', test_title: 'Fire Warden Refresher', score: 100 },
    });
  });

  it('a wrong answer scores accordingly and does not pass', async () => {
    const body = await (await POST(req('POST', TOKEN, { answers: { q1: 'b', q2: 'b' } }), ctx(TOKEN))).json();
    expect(body).toMatchObject({ score: 0, correctCount: 0, totalCount: 2 });
    expect(emitted[0].payload.passed).toBe(false);
  });

  it('refuses a non-built_in test — nothing here can complete it', async () => {
    tables.hs_tests[0].source_type = 'manual';
    const res = await POST(req('POST', TOKEN, { answers: {} }), ctx(TOKEN));
    expect(res.status).toBe(400);
    expect(tables.hs_test_submissions).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it('a second submission finds no link (burned on the first success), and an unknown link is refused too', async () => {
    await POST(req('POST', TOKEN, { answers: { q1: 'a', q2: 'a' } }), ctx(TOKEN));
    expect(tables.hs_test_tokens).toHaveLength(0);
    const again = await POST(req('POST', TOKEN, { answers: {} }), ctx(TOKEN));
    expect(again.status).toBe(404);
    expect(tables.hs_test_submissions).toHaveLength(1);

    const other = '99999999-2222-4333-8444-555555555555';
    expect((await POST(req('POST', other, { answers: {} }), ctx(other))).status).toBe(404);
  });

  it('an assignment already completed (e.g. a second token minted for it) is refused with "already"', async () => {
    tables.hs_test_assignments[0].status = 'completed';
    const res = await POST(req('POST', TOKEN, { answers: {} }), ctx(TOKEN));
    expect(res.status).toBe(400);
    expect(tables.hs_test_submissions).toHaveLength(0);
  });

  it('an expired link cannot submit', async () => {
    tables.hs_test_tokens[0].expires_at = '2020-01-01T00:00:00Z';
    const res = await POST(req('POST', TOKEN, { answers: { q1: 'a', q2: 'a' } }), ctx(TOKEN));
    expect(res.status).toBe(410);
    expect(tables.hs_test_submissions).toHaveLength(0);
  });
});
