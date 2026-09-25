import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';
import { askJev, canonical, inputHash, markActed } from '../client';
import type { JevQuestions } from '../types';

// askJev's policy, driven against a fake transport and the stateful
// fake database: off means null; every call is recorded, failures
// included; identical input is served from the table; the gate marks a
// low-confidence answer as unsure; and only AUTO_ACT_KINDS may be
// marked acted.

const Q: JevQuestions = { which: { type: 'choice', instructions: 'Which?', criteria: { a: 'A', b: 'B' } } };
let db: FakeDb;
let calls: unknown[];
let reply: { status: number | null; payload: unknown; error: string | null };

const transport = async (body: unknown) => { calls.push(body); return { ...reply, durationMs: 5 }; };

beforeEach(() => {
  process.env.JEV_API_KEY = 'k'; delete process.env.JEV_DISABLED; process.env.JEV_MODEL = 'jev-test';
  db = fakeSupabase({ companies: [{ id: 'co-1', feature_flags: {} }, { id: 'co-off', feature_flags: { ai_assist: false } }], jev_decisions: [] });
  calls = [];
  reply = { status: 200, payload: { answers: { which: { type: 'choice', choice: 'a', confidence: 0.92, probabilities: { a: 0.92, b: 0.08 } } }, model: 'jev-live', usage: { input_tokens: 40 } }, error: null };
});
afterEach(() => { delete process.env.JEV_API_KEY; delete process.env.JEV_DISABLED; delete process.env.JEV_MODEL; });

const ask = (over: Partial<Parameters<typeof askJev>[1]> = {}) => askJev(db.client, {
  kind: 'hs_item_classify', companyId: 'co-1', actor: { id: 'u1', kind: 'staff' }, state: { title: 'Fire alarm test' }, questions: Q, transport, ...over,
});

describe('askJev', () => {
  it('is off without a key, with JEV_DISABLED, or when the client has ai_assist off — and calls nothing', async () => {
    delete process.env.JEV_API_KEY;
    expect(await ask()).toBeNull();
    process.env.JEV_API_KEY = 'k'; process.env.JEV_DISABLED = '1';
    expect(await ask()).toBeNull();
    delete process.env.JEV_DISABLED;
    expect(await ask({ companyId: 'co-off' })).toBeNull();
    expect(calls).toEqual([]);
    expect(db.tables.jev_decisions).toEqual([]);
  });

  it('records the call with the raw response and returns validated answers', async () => {
    const r = await ask();
    expect(r).toMatchObject({ answers: { which: { selected: 'a', confidence: 0.92 } }, confidence: 0.92, gated: false, model: 'jev-live', inputTokens: 40, cached: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: 'jev-test', state: { title: 'Fire alarm test' }, questions: { which: { type: 'choice' } } });
    const row = db.tables.jev_decisions[0];
    expect(row).toMatchObject({ kind: 'hs_item_classify', company_id: 'co-1', actor_id: 'u1', actor_kind: 'staff', selected: { which: 'a' }, confidence: 0.92, gated: false, acted: false, status: 200, error: null, input_tokens: 40 });
    expect(row.response).toEqual(reply.payload);
    expect(r!.decisionId).toBe(row.id);
  });

  it('serves an identical input from the table instead of calling again', async () => {
    await ask();
    const r2 = await ask();
    expect(r2!.cached).toBe(true);
    expect(calls).toHaveLength(1);
    expect(db.tables.jev_decisions).toHaveLength(1);
    // a different title is a different input
    await ask({ state: { title: 'Legionella risk assessment' } });
    expect(calls).toHaveLength(2);
  });

  it('records a failed call and returns null', async () => {
    reply = { status: 503, payload: { error: 'busy' }, error: 'HTTP 503' };
    expect(await ask()).toBeNull();
    expect(db.tables.jev_decisions[0]).toMatchObject({ status: 503, error: 'HTTP 503', selected: null });
    // an unrecognised shape is also recorded, with the raw payload, and never acted on
    reply = { status: 200, payload: { totally: 'different' }, error: null };
    expect(await ask({ state: { title: 'other' } })).toBeNull();
    expect(db.tables.jev_decisions[1]).toMatchObject({ error: 'unrecognised response shape', response: { totally: 'different' } });
  });

  it('marks a low-confidence answer gated', async () => {
    reply.payload = { answers: { which: { type: 'choice', choice: 'b', confidence: 0.55, probabilities: { a: 0.45, b: 0.55 } } } };
    const r = await ask();
    expect(r).toMatchObject({ gated: true, confidence: 0.55, answers: { which: { selected: 'b' } } });
    expect(db.tables.jev_decisions[0].gated).toBe(true);
    const r2 = await ask({ gate: 0.5, state: { title: 'again' } });
    expect(r2!.gated).toBe(false);
  });

  it('never lets a recommendation-only kind be marked acted', async () => {
    await expect(markActed(db.client, 'hs_item_classify', 'x', 'form')).rejects.toThrow(/never acts/);
    await expect(markActed(db.client, 'hs_activity_followup', 'x', 'action')).rejects.toThrow(/never acts/);
    db.tables.jev_decisions.push({ id: 'd1', kind: 'hs_register_rank', acted: false });
    expect(await markActed(db.client, 'hs_register_rank', 'd1', 'digest order')).toBe(true);
    expect(db.tables.jev_decisions[0]).toMatchObject({ acted: true, acted_on: 'digest order' });
  });

  it('hashes canonically: key order does not matter, values do', () => {
    expect(canonical({ b: 1, a: [{ z: 1, y: 2 }] })).toBe('{"a":[{"y":2,"z":1}],"b":1}');
    expect(inputHash('m', { a: 1, b: 2 }, Q)).toBe(inputHash('m', { b: 2, a: 1 }, Q));
    expect(inputHash('m', { a: 1 }, Q)).not.toBe(inputHash('m', { a: 2 }, Q));
  });
});
