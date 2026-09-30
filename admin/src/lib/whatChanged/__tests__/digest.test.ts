import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

// Core-OS 360 Completion Programme, Phase 25, Group 5 (C9.5). Claim-
// before-send, opt-in only, role-scoped, client-visible-entity-type
// scoped, "nothing to report -> no email" — the same discipline the
// H&S weekly digest (weeklySummary.test.ts) already pins for the
// identical shape of job.

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email', () => ({
  sendEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return { id: 'r', delivered: true }; },
  lastEmailError: () => null,
}));

const { runWhatChangedDigest } = await import('../digest');

let db: FakeDb;

// now = Tuesday 29 Sep 2026 07:10 UTC -> yesterday = 28 Sep (daily window).
const tuesday = new Date('2026-09-29T07:10:00Z');
// now = Monday 28 Sep 2026 07:10 UTC -> yesterday = 27 Sep (daily window),
// weekStart = 21 Sep (weekly window: 21-27 Sep inclusive).
const monday = new Date('2026-09-28T07:10:00Z');

function profilesAndPrefs() {
  return {
    profiles: [
      { id: 'ca-daily',  email: 'ca-daily@client.com',  role: 'client_admin',  company_id: 'co-1' },
      { id: 'ca-weekly', email: 'ca-weekly@client.com', role: 'client_admin',  company_id: 'co-1' },
      { id: 'ca-off',    email: 'ca-off@client.com',    role: 'client_admin',  company_id: 'co-1' },
      { id: 'ce-daily',  email: 'ce-daily@client.com',  role: 'client_editor', company_id: 'co-1' },
    ],
    notification_preferences: [
      { user_id: 'ca-daily',  email_mode: 'immediate', muted_types: [], weekly_summary: true, what_changed_digest: 'daily' },
      { user_id: 'ca-weekly', email_mode: 'immediate', muted_types: [], weekly_summary: true, what_changed_digest: 'weekly' },
      { user_id: 'ca-off',    email_mode: 'immediate', muted_types: [], weekly_summary: true, what_changed_digest: 'off' },
      { user_id: 'ce-daily',  email_mode: 'immediate', muted_types: [], weekly_summary: true, what_changed_digest: 'daily' },
    ],
  };
}

beforeEach(() => { sent.length = 0; });
afterEach(() => { vi.clearAllMocks(); });

describe('runWhatChangedDigest — daily (Tuesday run, yesterday = 28 Sep)', () => {
  function fixture() {
    return {
      ...profilesAndPrefs(),
      platform_events: [
        { id: 1, occurred_at: '2026-09-28T10:00:00Z', company_id: 'co-1', entity_type: 'hs_incidents', event_type: 'created', actor_kind: 'staff' },
        { id: 2, occurred_at: '2026-09-28T11:00:00Z', company_id: 'co-1', entity_type: 'internal_tasks', event_type: 'created', actor_kind: 'system' },
      ],
      email_log: [],
    };
  }

  it('emails only the daily-opted-in client_admin, never client_editor or an off preference', async () => {
    db = fakeSupabase(fixture(), { now: () => tuesday });
    const t = await runWhatChangedDigest(db.client, { now: tuesday });
    expect(sent.map(s => s.to).sort()).toEqual(['ca-daily@client.com']);
    expect(t.daily_candidates).toBe(1);
    expect(t.weekly_candidates).toBe(0);
    expect(t.emailed).toBe(1);
  });

  it('a re-run for the same recipient and day sends nothing a second time (claimed via email_log)', async () => {
    db = fakeSupabase(fixture(), { now: () => tuesday });
    await runWhatChangedDigest(db.client, { now: tuesday });
    expect(sent).toHaveLength(1);
    const again = await runWhatChangedDigest(db.client, { now: tuesday });
    expect(again).toMatchObject({ emailed: 0, skipped_already: 1 });
    expect(sent).toHaveLength(1);
  });

  it('the email is scoped to CLIENT-VISIBLE entity types only — internal_tasks never inflates or leaks into the digest', async () => {
    db = fakeSupabase(fixture(), { now: () => tuesday });
    await runWhatChangedDigest(db.client, { now: tuesday });
    const mail = sent.find(s => s.to === 'ca-daily@client.com')!;
    expect(mail.html).toContain('1 change');
    expect(mail.html).not.toContain('Internal tasks');
  });

  it('a recipient whose window has zero client-visible events is skipped — no email, not an empty one', async () => {
    db = fakeSupabase({ ...fixture(), platform_events: [] }, { now: () => tuesday });
    const t = await runWhatChangedDigest(db.client, { now: tuesday });
    expect(t.skipped_nothing_changed).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it('no candidates at all (everyone off) does nothing', async () => {
    const fx = fixture();
    fx.notification_preferences = fx.notification_preferences.map(p => ({ ...p, what_changed_digest: 'off' }));
    db = fakeSupabase(fx, { now: () => tuesday });
    const t = await runWhatChangedDigest(db.client, { now: tuesday });
    expect(t).toMatchObject({ daily_candidates: 0, weekly_candidates: 0, emailed: 0 });
    expect(sent).toHaveLength(0);
  });
});

describe('runWhatChangedDigest — weekly (Monday run, week = 21-27 Sep)', () => {
  function fixture() {
    return {
      ...profilesAndPrefs(),
      // 23 Sep: inside the weekly window (21-27 Sep) but OUTSIDE the
      // Monday run's own daily window (27 Sep only) — proves the
      // weekly digest genuinely aggregates more than "yesterday".
      platform_events: [
        { id: 1, occurred_at: '2026-09-23T10:00:00Z', company_id: 'co-1', entity_type: 'hs_incidents', event_type: 'created', actor_kind: 'staff' },
      ],
      email_log: [],
    };
  }

  it('processes weekly recipients only on a Monday, and the digest spans the full week', async () => {
    db = fakeSupabase(fixture(), { now: () => monday });
    const t = await runWhatChangedDigest(db.client, { now: monday });
    expect(t.weekly_candidates).toBe(1);
    // The daily candidate (ca-daily) sees nothing — the 23rd falls
    // outside their own "yesterday" (27th) window.
    expect(t.daily_candidates).toBe(1);
    expect(sent.map(s => s.to).sort()).toEqual(['ca-weekly@client.com']);
  });

  it('a non-Monday run never processes weekly recipients at all', async () => {
    db = fakeSupabase(fixture(), { now: () => tuesday });
    const t = await runWhatChangedDigest(db.client, { now: tuesday });
    expect(t.weekly_candidates).toBe(0);
    expect(sent.map(s => s.to)).not.toContain('ca-weekly@client.com');
  });
});
