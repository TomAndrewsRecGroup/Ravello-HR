import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

// The Monday email: one per opted-in client admin, claimed per ISO week
// before the send; the register ranked by Jev when it answers, by the
// deterministic fallback when it does not. H&S is staff-delivered
// (2026-09-25, migration 105) — there is no provider digest any more.

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email', async () => {
  const w = await import('@/lib/email/templates/hsWeekly');
  return { ...w, sendEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return { id: 'r', delivered: true }; }, lastEmailError: () => null };
});
let jevReply: unknown = null;
let jevCalls = 0;
vi.mock('@/lib/jev/transport', async () => {
  const real = await vi.importActual<typeof import('@/lib/jev/transport')>('@/lib/jev/transport');
  return { ...real, sendToJev: async () => { jevCalls++; return { status: 200, payload: jevReply, error: null, durationMs: 2 }; } };
});

const { runWeeklySummary, isoWeek } = await import('../weeklySummary');

let db: FakeDb;
const now = new Date('2026-09-28T07:00:00Z');   // a Monday
beforeEach(() => {
  sent.length = 0; jevCalls = 0; jevReply = null;
  delete process.env.JEV_API_KEY;
  db = fakeSupabase({
    profiles: [
      { id: 'ca', email: 'ca@client.com', role: 'client_admin', company_id: 'co-1' },
      { id: 'cb', email: 'cb@client.com', role: 'client_admin', company_id: 'co-1' },
    ],
    companies: [{ id: 'co-1', name: 'Sample Co', active: true, feature_flags: {} }],
    notification_preferences: [{ user_id: 'cb', email_mode: 'immediate', muted_types: [], weekly_summary: false }],
    compliance_items: [
      { id: 'i1', company_id: 'co-1', title: 'Fire alarm test', category: 'hs_fire', status: 'overdue', due_date: '2026-09-20', domain: 'hs', recurrence_every: 12, recurrence_unit: 'month', legal_basis: 'RRFSO' },
      { id: 'i2', company_id: 'co-1', title: 'Legionella review', category: 'hs_water', status: 'pending', due_date: '2026-10-15', domain: 'hs', recurrence_every: 2, recurrence_unit: 'year', legal_basis: null },
      { id: 'i3', company_id: 'co-1', title: 'Done thing', category: 'hs_other', status: 'complete', due_date: '2026-09-01', domain: 'hs' },
    ],
    hs_register_completions: [{ id: 'c1', item_id: 'i1', company_id: 'co-1', outcome: 'fail', completed_on: '2026-09-24' }],
    hs_files: [], actions: [{ id: 'a1', company_id: 'co-1', status: 'active', action_type: 'hs_failed_check', title: 'Failed check: Fire alarm test', priority: 'high', created_at: '2026-09-24' }],
    hs_activities: [{ id: 'act', company_id: 'co-1', title: 'Visit', activity_type: 'site_visit', occurred_on: '2026-09-25' }],
    email_log: [], jev_decisions: [],
  }, { now: () => now });
});
afterEach(() => { delete process.env.JEV_API_KEY; });

describe('runWeeklySummary', () => {
  it('emails the opted-in admin once, with the failed fire check first, and claims per week', async () => {
    const t = await runWeeklySummary(db.client, { now });
    expect(t).toMatchObject({ clients: 1, emailed: 1, email_failures: 0, jev_ranked: 0 });
    expect(sent.map(s => s.to).sort()).toEqual(['ca@client.com']);
    const client = sent.find(s => s.to === 'ca@client.com')!;
    expect(client.subject).toBe('Your H&S summary: 1 overdue, 1 due soon');
    expect(client.html.indexOf('Fire alarm test')).toBeLessThan(client.html.indexOf('Legionella review'));
    expect(client.html).toContain('critical');
    expect(client.html).toContain('Failed check: Fire alarm test');
    expect(client.html).toContain('Core OS 360 · Site visit · 2026-09-25');
    expect(db.tables.email_log.map(e => e.dedupe_key).sort()).toEqual([`digest:client:ca:${isoWeek(now)}`]);

    const again = await runWeeklySummary(db.client, { now });
    expect(again).toMatchObject({ emailed: 0, skipped_already: 1 });
    expect(sent).toHaveLength(1);
  });

  it('uses Jev for the attention order when it answers, records the decision as acted, and falls back otherwise', async () => {
    process.env.JEV_API_KEY = 'k';
    jevReply = { answers: {
      item_0: { type: 'score', score: 1, confidence: 0.9, probabilities: { 0: 0, 1: 0.9, 2: 0.1, 3: 0 } },
      item_1: { type: 'score', score: 3, confidence: 0.9, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.9 } },
    } };
    const t = await runWeeklySummary(db.client, { now });
    expect(t.jev_ranked).toBe(1);
    expect(jevCalls).toBe(1);
    const client = sent.find(s => s.to === 'ca@client.com')!;
    expect(client.html.indexOf('Legionella review')).toBeLessThan(client.html.indexOf('Fire alarm test'));
    expect(db.tables.jev_decisions[0]).toMatchObject({ kind: 'hs_register_rank', acted: true, acted_on: 'weekly digest order' });
  });

  it('a client with PROTECT off, or nothing to report, gets no email', async () => {
    db.tables.companies[0].feature_flags = { protect: false };
    const t = await runWeeklySummary(db.client, { now });
    expect(t.clients).toBe(0);
    expect(sent.map(s => s.to)).toEqual([]);
  });

  it('isoWeek is stable across a year boundary', () => {
    expect(isoWeek(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01');
    expect(isoWeek(new Date('2027-01-03T00:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(now)).toBe('2026-W40');
  });
});
