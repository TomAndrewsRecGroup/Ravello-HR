import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

// Monday people insights: an absence pattern is a NUMBERS-ONLY question
// to Jev, answered as an in-app suggestion to the client's admins, once
// per employee per month, never emailed; onboarding risk once per
// instance per week, with a deterministic fallback when Jev is off.

const sent: unknown[] = [];
vi.mock('@/lib/email', () => ({
  sendEmail: async (m: unknown) => { sent.push(m); return { id: 'r', delivered: true }; },
  lastEmailError: () => null,
}));
const jevBodies: { state: Record<string, unknown>; questions: Record<string, unknown> }[] = [];
let absenceAnswer: unknown = null;
let riskAnswer: unknown = null;
vi.mock('@/lib/jev/transport', async () => {
  const real = await vi.importActual<typeof import('@/lib/jev/transport')>('@/lib/jev/transport');
  return {
    ...real,
    sendToJev: async (body: { state: Record<string, unknown>; questions: Record<string, unknown> }) => {
      jevBodies.push(body);
      const payload = 'pattern' in body.questions ? absenceAnswer : riskAnswer;
      return { status: 200, payload, error: null, durationMs: 2 };
    },
  };
});

const { runWeeklyPeople } = await import('../weeklyPeople');

let db: FakeDb;
const now = new Date('2026-09-28T07:00:00Z');   // a Monday, ISO week 40
beforeEach(() => {
  sent.length = 0; jevBodies.length = 0; absenceAnswer = null; riskAnswer = null;
  process.env.JEV_API_KEY = 'k'; delete process.env.JEV_DISABLED;
  db = fakeSupabase({
    companies: [
      { id: 'co-1', name: 'Sample Co', active: true, feature_flags: {} },
      { id: 'co-off', name: 'No AI Co', active: true, feature_flags: { ai_assist: false } },
    ],
    profiles: [{ id: 'ca', email: 'ca@client.com', role: 'client_admin', company_id: 'co-1' }, { id: 'staff-1', email: 't@x.com', role: 'tps_admin' }],
    notification_preferences: [{ user_id: 'ca', email_mode: 'immediate', muted_types: [], weekly_summary: true }],
    absence_records: [
      // emp-1: four one-day sickness spells around weekends
      { id: 'a1', company_id: 'co-1', employee_id: 'emp-1', employee_name: 'Ada Lovelace', absence_type: 'sick', start_date: '2026-09-07', end_date: '2026-09-07', days: 1, status: 'approved', notes: 'private' },
      { id: 'a2', company_id: 'co-1', employee_id: 'emp-1', employee_name: 'Ada Lovelace', absence_type: 'sick', start_date: '2026-08-14', end_date: null, days: null, status: 'approved' },
      { id: 'a3', company_id: 'co-1', employee_id: 'emp-1', employee_name: 'Ada Lovelace', absence_type: 'sick', start_date: '2026-07-06', end_date: '2026-07-06', days: 1, status: 'pending' },
      { id: 'a4', company_id: 'co-1', employee_id: 'emp-1', employee_name: 'Ada Lovelace', absence_type: 'holiday', start_date: '2026-06-02', end_date: '2026-06-04', days: 3, status: 'approved' },
      // emp-2: one spell, below the floor
      { id: 'a5', company_id: 'co-1', employee_id: 'emp-2', employee_name: 'Bob', absence_type: 'sick', start_date: '2026-09-01', end_date: null, days: 1, status: 'approved' },
      // legacy rows typed by name: cannot be scored
      { id: 'a6', company_id: 'co-1', employee_id: null, employee_name: 'Carol', absence_type: 'sick', start_date: '2026-09-01', days: 1, status: 'approved' },
      { id: 'a7', company_id: 'co-1', employee_id: null, employee_name: 'Carol', absence_type: 'sick', start_date: '2026-08-01', days: 1, status: 'approved' },
      { id: 'a8', company_id: 'co-1', employee_id: null, employee_name: 'Carol', absence_type: 'sick', start_date: '2026-07-01', days: 1, status: 'approved' },
      // rejected and old spells do not count
      { id: 'a9', company_id: 'co-1', employee_id: 'emp-2', employee_name: 'Bob', absence_type: 'sick', start_date: '2026-09-02', days: 1, status: 'rejected' },
      { id: 'a10', company_id: 'co-1', employee_id: 'emp-2', employee_name: 'Bob', absence_type: 'sick', start_date: '2025-01-02', days: 1, status: 'approved' },
      { id: 'a11', company_id: 'co-2', employee_id: 'emp-2', employee_name: 'Bob', absence_type: 'sick', start_date: '2026-09-03', days: 1, status: 'approved' },
    ],
    onboarding_instances: [{
      id: 'inst-1', company_id: 'co-1', status: 'in_progress', employee_id: 'emp-1', started_at: '2026-09-01T00:00:00Z',
      employee_records: { full_name: 'Ada Lovelace', start_date: '2026-09-01', probation_end: '2026-12-01' },
      onboarding_task_progress: [{ status: 'pending', due_date: '2026-09-10' }, { status: 'completed', due_date: '2026-09-05' }, { status: 'pending', due_date: '2026-10-20' }],
    }, {
      id: 'inst-done', company_id: 'co-1', status: 'completed', employee_id: 'emp-3', started_at: '2026-01-01T00:00:00Z', employee_records: null, onboarding_task_progress: [],
    }],
    notifications: [], email_log: [], jev_decisions: [],
  }, { now: () => now });
});
afterEach(() => { delete process.env.JEV_API_KEY; });

const choice = (sel: string, conf = 0.9) => ({ type: 'choice', choice: sel, confidence: conf, probabilities: { [sel]: conf } });

describe('runWeeklyPeople', () => {
  it('asks Jev with numbers only, flags the pattern in-app to the admins once a month, and never emails', async () => {
    absenceAnswer = { answers: { pattern: choice('discuss'), short_frequent: { type: 'noul', noul: 0.85 } } };
    riskAnswer = { answers: { risk: { type: 'score', score: 'at_risk', confidence: 0.8, legend: {}, probabilities: {} } } };
    const t = await runWeeklyPeople(db.client, { now });
    expect(t).toMatchObject({ companies: 1, employees_scored: 1, absence_flags: 1, onboarding_scored: 1, onboarding_flags: 1, jev_calls: 2, errors: [] });

    const absenceBody = jevBodies.find(b => 'pattern' in b.questions)!;
    expect(absenceBody.state).toEqual({ spells_12m: 4, days_12m: 6, bradford_factor: 96, sick_share: 0.75, mon_fri_share: 0.75, short_spells: 3 });
    for (const v of Object.values(absenceBody.state)) expect(typeof v).toBe('number');
    expect(JSON.stringify(absenceBody)).not.toMatch(/Ada|Lovelace|private|emp-1/);

    const flags = db.tables.notifications.filter(n => n.type === 'absence_pattern_flag');
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ user_id: 'ca', title: 'Ada Lovelace: 4 absence spells in 12 months (Bradford 96)', link: '/lead/absence', dedupe_key: 'absence_pattern:emp-1:2026-09:ca' });
    expect(flags[0].body).toMatch(/return-to-work/);
    expect(flags[0].emailed_at).toBeTruthy();     // claimed so no digest or immediate send can pick it up
    expect(sent).toHaveLength(0);
    expect(db.tables.email_log).toHaveLength(0);

    const risk = db.tables.notifications.filter(n => n.type === 'onboarding_risk');
    expect(risk).toHaveLength(1);
    expect(risk[0]).toMatchObject({ user_id: 'ca', title: "Ada Lovelace's onboarding is at risk", body: '1 overdue of 3 tasks, 27 days since start.', link: '/lead/onboarding', dedupe_key: 'onboarding_risk:inst-1:2026-W40:ca' });

    // the employee record and the absence rows are untouched
    expect(db.tables.absence_records.every(r => !('pattern' in r))).toBe(true);

    // a second run the same week: the decisions are cached, nothing is created twice
    const t2 = await runWeeklyPeople(db.client, { now });
    expect(t2).toMatchObject({ absence_flags: 1, onboarding_flags: 1, jev_calls: 0 });
    expect(db.tables.notifications).toHaveLength(2);
  });

  it('no concern, or a gated answer, flags nothing; the risk falls back to the deterministic read', async () => {
    absenceAnswer = { answers: { pattern: choice('monitor', 0.4), short_frequent: { type: 'noul', noul: 0.5 } } };   // below the 0.7 gate
    riskAnswer = { answers: { risk: { type: 'score', score: 'on_track', confidence: 0.3, legend: {}, probabilities: {} } } };   // below 0.6: fallback says slipping
    const t = await runWeeklyPeople(db.client, { now });
    expect(t).toMatchObject({ employees_scored: 1, absence_flags: 0, onboarding_scored: 1, onboarding_flags: 1 });
    expect(db.tables.notifications.map(n => n.type)).toEqual(['onboarding_risk']);
    expect(db.tables.notifications[0].title).toMatch(/slipping/);
  });

  it('with Jev off: no absence flag (numbers alone never accuse anyone), onboarding still uses the fallback', async () => {
    delete process.env.JEV_API_KEY;
    const t = await runWeeklyPeople(db.client, { now });
    expect(t).toMatchObject({ employees_scored: 1, absence_flags: 0, onboarding_flags: 1, jev_calls: 0 });
    expect(jevBodies).toHaveLength(0);
  });

  it('a company with lead or ai_assist off is skipped entirely', async () => {
    db.tables.companies[0].feature_flags = { lead: false };
    absenceAnswer = { answers: { pattern: choice('discuss'), short_frequent: { type: 'noul', noul: 0.9 } } };
    const t = await runWeeklyPeople(db.client, { now });
    expect(t).toMatchObject({ companies: 0, employees_scored: 0 });
    expect(jevBodies).toHaveLength(0);
  });
});
