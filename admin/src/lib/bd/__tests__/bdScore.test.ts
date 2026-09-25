import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

// The Sunday score: every prospect scored from OUR OWN numbers (no
// IvyLens feed since 2026-09-25 — BD Intelligence and BD Roles, the
// two pages it fed, are gone), Jev's next action taken when confident,
// else the deterministic fallback; at most MAX_CALL_TASKS call tasks a
// run, one per prospect per month.

const jevBodies: any[] = [];
// Jev answers 'call' for a company with plenty of live roles, 'watch'
// otherwise — standing in for a real judgment call the deterministic
// score alone can no longer reach (its ceiling without a friction
// signal is 55, below the fallback's own call threshold of 60).
let jevReplyFor: (body: { state: { active_roles: number; prior_status: string } }) => unknown = body =>
  ({ answers: { next_action: { type: 'choice', choice: body.state.prior_status === 'Client' ? 'dismiss' : body.state.active_roles >= 2 ? 'call' : 'watch', confidence: 0.9, probabilities: {} }, need_now: { type: 'score', score: 'medium', confidence: 0.9, legend: {}, probabilities: {} } } });
vi.mock('@/lib/jev/transport', async () => {
  const real = await vi.importActual<typeof import('@/lib/jev/transport')>('@/lib/jev/transport');
  return { ...real, sendToJev: async (body: any) => { jevBodies.push(body); return { status: 200, payload: jevReplyFor(body), error: null, durationMs: 1 }; } };
});

const { runBdScore, MAX_CALL_TASKS } = await import('../score');

const now = new Date('2026-09-27T06:00:00Z');
let db: FakeDb;
beforeEach(() => {
  jevBodies.length = 0;
  process.env.JEV_API_KEY = 'k'; delete process.env.JEV_DISABLED;
  // Company i has i active scanned roles (0..7); six of them (2..7) clear
  // Jev's call line (active_roles >= 5).
  const companies = Array.from({ length: 8 }, (_, i) => ({
    id: `bd-${i}`, company_name: `Company ${i}`, company_name_normalised: `company ${i}`, status: 'prospect',
    total_roles_seen: 10, last_seen_at: '2026-09-24T00:00:00Z', notes: null, outreach_status: null,
  }));
  companies.push({ id: 'bd-client', company_name: 'Won Co', company_name_normalised: 'won', status: 'Client', total_roles_seen: 9, last_seen_at: '2026-09-24T00:00:00Z', notes: null, outreach_status: null });
  db = fakeSupabase({
    bd_companies: companies,
    bd_scanned_roles: companies.flatMap(c => {
      const i = Number(c.id.replace('bd-', '')) || 0;
      const activeCount = c.id === 'bd-client' ? 0 : Math.min(i, 7);
      return Array.from({ length: 7 }, (_, j) => ({ id: `${c.id}-r${j}`, company_id: c.id, still_active: j < activeCount }));
    }),
    profiles: [{ id: 'owner', role: 'tps_admin', email: 't@x.com', created_at: '2026-01-01' }],
    internal_tasks: [], jev_decisions: [],
  }, { now: () => now });
});
afterEach(() => { delete process.env.JEV_API_KEY; });

describe('runBdScore', () => {
  it('scores everyone from our own numbers, caps the call tasks, and never queues the same prospect twice in a month', async () => {
    const t = await runBdScore(db.client, { now });
    expect(t).toMatchObject({ prospects: 9, scored: 9, errors: [] });
    expect(t.call_tasks).toBe(MAX_CALL_TASKS);
    const won = db.tables.bd_companies.find(c => c.id === 'bd-client')!;
    expect(won).toMatchObject({ prospect_score: 0, next_action: 'dismiss' });
    const c5 = db.tables.bd_companies.find(c => c.id === 'bd-5')!;
    const c2 = db.tables.bd_companies.find(c => c.id === 'bd-2')!;
    // active_roles is clamped at 5 for scoring: 5 live roles plus a
    // history of more (10 seen) scores higher than 5 live and no history.
    expect(c5.prospect_score).toBeGreaterThan(c2.prospect_score);
    expect(c5.score_inputs).toMatchObject({ active_roles: 5, high_repost: 0, long_vacancy: 0, volume_hiring: 0 });
    // bd-2 .. bd-7 clear Jev's call line (active_roles >= 2); six companies
    expect(db.tables.bd_companies.filter(c => c.next_action === 'call')).toHaveLength(6);
    for (const b of jevBodies) for (const v of Object.values(b.state as Record<string, unknown>)) expect(typeof v === 'number' || typeof v === 'string').toBe(true);
    expect(JSON.stringify(jevBodies)).not.toMatch(/Company \d|Won Co/);   // no company name reaches Jev
    const tasks = db.tables.internal_tasks;
    expect(tasks).toHaveLength(MAX_CALL_TASKS);
    expect(tasks[0]).toMatchObject({ assigned_to: 'owner', created_by: 'owner', status: 'todo', due_date: '2026-10-02' });
    expect(tasks[0].source_ref).toMatch(/^bd_call:bd-\d+:2026-09$/);
    expect(tasks[0].title).toBe('Call Company 5');   // highest score first

    // a second run the same month adds nothing; next month it may
    const t2 = await runBdScore(db.client, { now });
    expect(t2.call_tasks).toBe(0);
    expect(db.tables.internal_tasks).toHaveLength(MAX_CALL_TASKS);
    const t3 = await runBdScore(db.client, { now: new Date('2026-10-04T06:00:00Z') });
    expect(t3.call_tasks).toBe(MAX_CALL_TASKS);
  });

  it('takes Jev\'s next action when confident, the fallback when not', async () => {
    jevReplyFor = () => ({ answers: { next_action: { type: 'choice', choice: 'watch', confidence: 0.9, probabilities: { watch: 0.9 } }, need_now: { type: 'score', score: 'low', confidence: 0.9, legend: {}, probabilities: {} } } });
    const t = await runBdScore(db.client, { now });
    expect(t.jev_answered).toBe(9);
    expect(db.tables.bd_companies.filter(c => c.id !== 'bd-client').every(c => c.next_action === 'watch')).toBe(true);
    expect(t.call_tasks).toBe(0);

    jevReplyFor = () => ({ answers: { next_action: { type: 'choice', choice: 'dismiss', confidence: 0.3, probabilities: { dismiss: 0.3 } }, need_now: { type: 'score', score: 'none', confidence: 0.3, legend: {}, probabilities: {} } } });
    // a new set of inputs so the 30-day cache does not answer with the first reply
    db.tables.bd_companies.forEach(c => { c.outreach_status = 'emailed'; });
    const t2 = await runBdScore(db.client, { now });
    expect(t2.jev_answered).toBe(0);
    expect(db.tables.bd_companies.find(c => c.id === 'bd-1')!.next_action).toBe('watch');   // low score (23), no history bonus in prospectScore
  });

  it('with no prospects does nothing and calls nobody', async () => {
    db.tables.bd_companies.length = 0;
    const t = await runBdScore(db.client, { now });
    expect(t).toMatchObject({ prospects: 0, scored: 0, call_tasks: 0 });
    expect(jevBodies).toHaveLength(0);
  });
});
