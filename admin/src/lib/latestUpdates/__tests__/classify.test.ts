import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

// Regulatory-change broadcast: classify unclassified published Latest
// Updates rows, and tell STAFF ONLY when Jev is confident it is a
// regulatory change AND at least one client's register already holds
// that category. This never writes compliance_items or actions, and
// never notifies a client — a human always decides from /broadcast.

vi.mock('@/lib/email', () => ({
  sendEmail: async (m: unknown) => { throw new Error('should not send email for a staff daily-digest recipient: ' + JSON.stringify(m)); },
  lastEmailError: () => null,
}));

const jevBodies: { state: Record<string, unknown>; questions: Record<string, unknown> }[] = [];
let answer: unknown = null;
vi.mock('@/lib/jev/transport', async () => {
  const real = await vi.importActual<typeof import('@/lib/jev/transport')>('@/lib/jev/transport');
  return {
    ...real,
    sendToJev: async (body: { state: Record<string, unknown>; questions: Record<string, unknown> }) => {
      jevBodies.push(body);
      return { status: 200, payload: answer, error: null, durationMs: 3 };
    },
  };
});

const { runClassifyUpdates } = await import('../classify');

const choice = (sel: string, conf = 0.9) => ({ type: 'choice', choice: sel, confidence: conf, probabilities: { [sel]: conf } });
const noul = (p: number) => ({ type: 'noul', noul: p });

let db: FakeDb;
const now = new Date('2026-09-26T06:30:00Z');

beforeEach(() => {
  jevBodies.length = 0; answer = null;
  process.env.JEV_API_KEY = 'k'; delete process.env.JEV_DISABLED;
  db = fakeSupabase({
    latest_updates: [
      { id: 'u1', title: 'HSE updates fire door guidance', description: 'New guidance on fire door inspections.', status: 'published', regulatory_classified_at: null },
      { id: 'u2', title: 'Local team wins award', description: 'A nice story, not regulatory.', status: 'published', regulatory_classified_at: null },
      { id: 'u3', title: 'Already looked at', description: null, status: 'published', regulatory_classified_at: '2026-09-01T00:00:00Z', regulatory_category: 'hr' },
      { id: 'u4', title: 'Draft, not public', description: null, status: 'draft', regulatory_classified_at: null },
    ],
    compliance_items: [
      { id: 'ci1', company_id: 'co-1', category: 'hs_fire' },
      { id: 'ci2', company_id: 'co-2', category: 'hs_fire' },
      { id: 'ci3', company_id: 'co-1', category: 'hr' },
    ],
    profiles: [{ id: 'staff-1', email: 't@x.com', role: 'tps_admin' }],
    notification_preferences: [],
    notifications: [], email_log: [], jev_decisions: [], companies: [],
  }, { now: () => now });
});

describe('runClassifyUpdates', () => {
  it('classifies a real regulatory change, records it, and tells staff (affected companies exist)', async () => {
    // The mocked transport answers every call the same way regardless of
    // the article, so BOTH candidate rows classify as hs_fire here — the
    // point of this fixture is the write-back and notify shape, not
    // per-article discrimination (that's Jev's own model, not this code).
    answer = { answers: { is_regulatory_change: noul(0.95), category: choice('hs_fire', 0.9) } };
    const t = await runClassifyUpdates(db.client, { now });
    expect(t).toMatchObject({ candidates: 2, classified: 2, regulatory_changes: 2, notified: 2, errors: [] });

    const u1 = db.tables.latest_updates.find((r: any) => r.id === 'u1')!;
    expect(u1.regulatory_category).toBe('hs_fire');
    expect(u1.regulatory_classified_at).toBe(now.toISOString());
    expect(typeof u1.regulatory_confidence).toBe('number');

    expect(db.tables.notifications).toHaveLength(2);
    const n1 = db.tables.notifications.find((n: any) => n.link === '/broadcast?update=u1');
    expect(n1).toMatchObject({ user_id: 'staff-1', type: 'regulatory_change_detected' });
  });

  it('a non-regulatory article is recorded as \'none\' and nobody is told', async () => {
    answer = { answers: { is_regulatory_change: noul(0.1), category: choice('none', 0.95) } };
    const t = await runClassifyUpdates(db.client, { now });
    expect(t).toMatchObject({ classified: 2, regulatory_changes: 0, notified: 0 });
    for (const r of db.tables.latest_updates) if (r.id === 'u1' || r.id === 'u2') expect(r.regulatory_category).toBe('none');
  });

  it('a real category with no client register match is recorded but never notified', async () => {
    answer = { answers: { is_regulatory_change: noul(0.95), category: choice('data', 0.9) } };
    const t = await runClassifyUpdates(db.client, { now });
    expect(t.regulatory_changes).toBeGreaterThan(0);
    expect(t.notified).toBe(0);
    expect(db.tables.notifications).toHaveLength(0);
  });

  it('a low-confidence answer is gated to \'none\' rather than acted on', async () => {
    answer = { answers: { is_regulatory_change: noul(0.9), category: choice('hs_fire', 0.3) } };
    const t = await runClassifyUpdates(db.client, { now });
    expect(t.regulatory_changes).toBe(0);
    expect(t.notified).toBe(0);
  });

  it('never reconsiders an already-classified or draft row, and never writes compliance_items, actions or a client notification', async () => {
    answer = { answers: { is_regulatory_change: noul(0.95), category: choice('hs_fire', 0.9) } };
    await runClassifyUpdates(db.client, { now });
    const u3 = db.tables.latest_updates.find((r: any) => r.id === 'u3')!;
    expect(u3.regulatory_category).toBe('hr'); // untouched
    expect(db.tables.latest_updates.find((r: any) => r.id === 'u4')!.regulatory_classified_at).toBeNull();
    expect(db.tables.compliance_items).toHaveLength(3); // unchanged
    expect((db.tables.actions ?? [])).toHaveLength(0);
    expect(db.tables.notifications.every((n: any) => n.user_id === 'staff-1')).toBe(true);
  });

  it('Jev disabled: rows are left unclassified rather than guessed', async () => {
    delete process.env.JEV_API_KEY;
    const t = await runClassifyUpdates(db.client, { now });
    expect(t.jev_calls).toBe(0);
    expect(t.classified).toBe(2);
    for (const r of db.tables.latest_updates) if (r.id === 'u1' || r.id === 'u2') expect(r.regulatory_category).toBe('none');
  });
});
