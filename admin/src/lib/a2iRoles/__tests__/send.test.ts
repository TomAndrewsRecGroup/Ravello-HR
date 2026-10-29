import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';
import { runRoleAlert, requeueFailed, type RunDeps } from '../send';
import { JOB_AI_ENGINEERS, JOB_AUTOMATION_ENGINEER, THURSDAY_3PM } from './fixtures';

beforeAll(() => { process.env.NEXT_PUBLIC_PORTAL_URL = 'https://portal.thepeoplesystem.co.uk'; });

const TOM = 'profile-tom';

function seed(over: { enabled?: boolean; mode?: 'all' | 'selected'; athletes?: any[]; optouts?: any[]; selected?: any[] } = {}): FakeDb {
  return fakeSupabase({
    a2i_role_alert_config: [{
      id: 'cfg', singleton: true, enabled: over.enabled ?? true, recipient_mode: over.mode ?? 'all',
      sender_profile_id: TOM, role_url_template: 'https://www.andrews-recruitment.com/jobs/{id}',
      notify_email: 'tom@andrews-recruitment.com', updated_by: null,
    }],
    athletes: over.athletes ?? [
      { id: 'a1', full_name: 'Sam Rivers', email: 'sam@example.com', company_id: 'c1' },
      { id: 'a2', full_name: 'Jo Lane', email: 'jo@example.com', company_id: 'c1' },
      { id: 'a3', full_name: 'Alex Moss', email: 'alex@example.com', company_id: 'c2' },
    ],
    a2i_role_alert_optouts: over.optouts ?? [],
    a2i_role_alert_recipients: over.selected ?? [],
    companies: [{ id: 'c9', name: 'Tarmac', manatal_client_id: '4247425' }],
  });
}

function deps(over: Partial<RunDeps> & { sendImpl?: (to: string) => { ok: true; messageId: string } | { ok: false; error: string } } = {}) {
  const sent: Array<{ to: string; html: string; headers?: Record<string, string>; subject: string }> = [];
  const alerts: string[] = [];
  let n = 0;
  const d: RunDeps = {
    listJobs: async () => ({ jobs: [JOB_AUTOMATION_ENGINEER, JOB_AI_ENGINEERS] as any, truncated: false, error: null }),
    orgName: async () => 'Micro1',
    loadSender: async () => ({
      ok: true, profileId: TOM, fromEmail: 'tom@andrews-recruitment.com',
      creds: { host: 'smtp.office365.com', port: 587, secure: false, user: 'tom', pass: 'x', fromEmail: 'tom@andrews-recruitment.com' },
    }),
    openSmtp: () => ({
      verify: async () => ({ ok: true as const }),
      send: async (input) => {
        const r = over.sendImpl ? over.sendImpl(input.to) : { ok: true as const, messageId: `m-${++n}` };
        if (r.ok) sent.push({ to: input.to, html: input.html, headers: input.headers, subject: input.subject });
        return r;
      },
      close: () => {},
    }),
    alert: async (_sb, _c, _s, subject) => { alerts.push(subject); },
    mintToken: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    ...over,
  };
  return { d, sent, alerts };
}

/** Every 5-minute cron tick from `from` until the send settles (the
 *  stagger spreads it over an hour). Returns the last tick's result. */
async function runHour(db: FakeDb, d: RunDeps, from: Date = THURSDAY_3PM) {
  let r = await runRoleAlert(db.client, { now: from, trigger: 'cron', deps: d });
  for (let t = from.getTime() + 5 * 60_000; t <= from.getTime() + 70 * 60_000; t += 5 * 60_000) {
    if (r.tally.status !== 'sending') break;
    r = await runRoleAlert(db.client, { now: new Date(t), trigger: 'cron', deps: d });
  }
  return r;
}

describe('runRoleAlert', () => {
  it('cron does nothing while the feature is switched off', async () => {
    const db = seed({ enabled: false });
    const { d, sent } = deps();
    const r = await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: d });
    expect(r.tally.skipped).toBe('disabled');
    expect(sent).toHaveLength(0);
    expect(db.tables.a2i_role_alert_sends ?? []).toHaveLength(0);
  });

  it('cron does nothing before 3pm UK on a Thursday, or on another day', async () => {
    const db = seed();
    const { d, sent } = deps();
    expect((await runRoleAlert(db.client, { now: new Date('2026-10-29T14:59:00Z'), trigger: 'cron', deps: d })).tally.skipped).toBe('outside_window');
    expect((await runRoleAlert(db.client, { now: new Date('2026-10-28T15:30:00Z'), trigger: 'cron', deps: d })).tally.skipped).toBe('outside_window');
    expect(sent).toHaveLength(0);
  });

  it('emails every athlete once, and a second run the same week sends nothing', async () => {
    const db = seed();
    const { d, sent } = deps();
    const first = await runHour(db, d);
    expect(first.tally).toMatchObject({ status: 'complete', roles: 2, recipients: 3 });
    expect(sent.map(s => s.to).sort()).toEqual(['alex@example.com', 'jo@example.com', 'sam@example.com']);

    const second = await runRoleAlert(db.client, { now: new Date('2026-10-29T16:20:00Z'), trigger: 'cron', deps: d });
    expect(second.tally.skipped).toBe('already_sent');
    const manual = await runRoleAlert(db.client, { now: new Date('2026-10-29T16:30:00Z'), trigger: 'manual', deps: d });
    expect(manual.tally.skipped).toBe('already_sent');
    expect(sent).toHaveLength(3);

    const send = db.tables.a2i_role_alert_sends[0];
    expect(send).toMatchObject({ week_key: '2026-W44', status: 'complete', sent_count: 3, failed_count: 0, sender_email: 'tom@andrews-recruitment.com' });
    expect(db.tables.a2i_role_alert_tokens).toHaveLength(3);
    expect(db.tables.email_log).toHaveLength(3);
  });

  it('only ever sends to athletes — every recipient is an athletes row', async () => {
    const db = seed();
    const { d, sent } = deps();
    await runHour(db, d);
    expect(sent).toHaveLength(3);
    const athleteEmails = new Set(db.tables.athletes.map((a: any) => a.email));
    for (const s of sent) expect(athleteEmails.has(s.to)).toBe(true);
    for (const row of db.tables.email_log) expect(row.target_type).toBe('athlete');
  });

  it('skips an opted-out athlete and the same person under a second athlete row', async () => {
    const db = seed({
      athletes: [
        { id: 'a1', full_name: 'Sam Rivers', email: 'sam@example.com', company_id: 'c1' },
        { id: 'a1b', full_name: 'Sam Rivers', email: 'SAM@example.com', company_id: 'c2' },
        { id: 'a2', full_name: 'Jo Lane', email: 'jo@example.com', company_id: 'c1' },
      ],
      optouts: [{ id: 'o1', email_lower: 'jo@example.com', source: 'link' }],
    });
    const { d, sent } = deps();
    await runHour(db, d);
    expect(sent.map(s => s.to)).toEqual(['sam@example.com']);
  });

  it('selected mode sends only to the chosen athletes', async () => {
    const db = seed({ mode: 'selected', selected: [{ id: 'r1', athlete_id: 'a2' }] });
    const { d, sent } = deps();
    await runHour(db, d);
    expect(sent.map(s => s.to)).toEqual(['jo@example.com']);
  });

  it('each email carries its own Match me and unsubscribe links; the stored copy carries no token', async () => {
    const db = seed();
    const { d, sent } = deps();
    await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: d });
    const s = sent[0];
    expect(s.html).toMatch(/\/r\/roles\/00000000-0000-4000-8000-\d{12}\/match\/4467043/);
    expect(s.headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/portal\.thepeoplesystem\.co\.uk\/r\/roles\/00000000-0000-4000-8000-\d{12}\/unsubscribe>$/);
    expect(s.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(s.html).not.toContain('Tarmac');
    for (const log of db.tables.email_log) expect(log.body_html).not.toMatch(/00000000-0000-4000-8000/);
    // Tokens are stored hashed, never raw.
    for (const t of db.tables.a2i_role_alert_tokens) expect(t.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('snapshots the roles with the client name for Tom (internal only)', async () => {
    const db = seed();
    const { d } = deps();
    await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: d });
    const jobs = db.tables.a2i_role_alert_sends[0].jobs;
    expect(jobs.map((j: any) => [j.id, j.clientName])).toEqual([['4467043', 'Tarmac'], ['4337074', 'Micro1']]);
  });

  it('a Manatal failure sends nothing; the next run tries again and sends', async () => {
    const db = seed();
    const ok = deps();
    const broken = deps({ listJobs: async () => ({ jobs: [], truncated: true, error: 'HTTP 502' }) });
    const r = await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: broken.d });
    expect(r.tally.status).toBe('failed');
    expect(broken.sent).toHaveLength(0);
    expect(broken.alerts).toHaveLength(0);   // not yet the final attempt
    const again = await runHour(db, ok.d, new Date('2026-10-29T15:20:00Z'));
    expect(again.tally.status).toBe('complete');
    expect(ok.sent).toHaveLength(3);
  });

  it('tells Tom once when Manatal is still failing late in the afternoon', async () => {
    const db = seed();
    const broken = deps({ listJobs: async () => ({ jobs: [], truncated: true, error: 'HTTP 502' }) });
    await runRoleAlert(db.client, { now: new Date('2026-10-29T17:30:00Z'), trigger: 'cron', deps: broken.d });
    await runRoleAlert(db.client, { now: new Date('2026-10-29T17:45:00Z'), trigger: 'cron', deps: broken.d });
    expect(broken.alerts).toEqual(['Thursday roles email did not go out']);
  });

  it('no live roles: nothing is sent', async () => {
    const db = seed();
    const { d, sent } = deps({ listJobs: async () => ({ jobs: [{ ...JOB_AUTOMATION_ENGINEER, status: 'on_hold' }] as any, truncated: false, error: null }) });
    const r = await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: d });
    expect(r.tally.status).toBe('no_roles');
    expect(sent).toHaveLength(0);
  });

  it('an SMTP login failure sends nothing', async () => {
    const db = seed();
    const { d, sent } = deps({
      openSmtp: () => ({ verify: async () => ({ ok: false as const, error: '535 Authentication unsuccessful' }), send: vi.fn(), close: () => {} }),
    });
    const r = await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: d });
    expect(r.tally.status).toBe('failed');
    expect(r.error).toMatch(/535/);
    expect(sent).toHaveLength(0);
    expect(db.tables.a2i_role_alert_deliveries ?? []).toHaveLength(0);
  });

  it('stops after three failures in a row and tells Tom once', async () => {
    const db = seed({
      athletes: ['a', 'b', 'c', 'd', 'e'].map(x => ({ id: x, full_name: x, email: `${x}@example.com`, company_id: 'c1' })),
    });
    const { d, alerts } = deps({ sendImpl: () => ({ ok: false, error: '421 throttled' }) });
    // "Send now" sends everything at once, which is where a run of
    // failures has to stop it (a staggered tick sends one or two).
    const r = await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'manual', deps: d });
    expect(r.tally).toMatchObject({ status: 'failed', failed_this_run: 3, remaining: 2 });
    expect(alerts).toEqual(['Some Thursday roles emails did not send']);
  });

  it('a run that runs out of time resumes on the next tick without re-sending anyone', async () => {
    const db = seed({
      athletes: ['a', 'b', 'c', 'd'].map(x => ({ id: x, full_name: x, email: `${x}@example.com`, company_id: 'c1' })),
    });
    let t = 0;
    const slow = deps({ budgetMs: 25, clock: () => (t += 10) });
    // "Send now" queues everyone as due at once, so the budget is what
    // stops it; the next cron tick carries on.
    const r1 = await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'manual', deps: slow.d });
    expect(r1.tally.status).toBe('sending');
    expect(r1.tally.remaining).toBeGreaterThan(0);
    const ok = deps();
    const r2 = await runRoleAlert(db.client, { now: new Date('2026-10-29T15:20:00Z'), trigger: 'cron', deps: ok.d });
    expect(r2.tally.status).toBe('complete');
    const all = [...slow.sent, ...ok.sent].map(s => s.to).sort();
    expect(all).toEqual(['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']);
  });

  it('two runs racing (a cron tick and "Send now") never email the same person twice', async () => {
    const db = seed();
    const a = deps();
    const b = deps();
    await Promise.all([
      runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: a.d }),
      runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'manual', deps: b.d }),
    ]);
    const all = [...a.sent, ...b.sent].map(s => s.to).sort();
    expect(all).toEqual(['alex@example.com', 'jo@example.com', 'sam@example.com']);
  });

  it('retry failed re-sends only the failed ones', async () => {
    const db = seed();
    const flaky = deps({ sendImpl: to => (to === 'jo@example.com' ? { ok: false, error: 'timeout' } : { ok: true, messageId: 'x' }) });
    await runHour(db, flaky.d);
    expect(flaky.sent.map(s => s.to).sort()).toEqual(['alex@example.com', 'sam@example.com']);

    const { requeued } = await requeueFailed(db.client, new Date('2026-10-29T16:20:00Z'));
    expect(requeued).toBe(1);
    const ok = deps();
    const r = await runRoleAlert(db.client, { now: new Date('2026-10-29T16:20:00Z'), trigger: 'manual', deps: ok.d });
    expect(r.tally.status).toBe('complete');
    expect(ok.sent.map(s => s.to)).toEqual(['jo@example.com']);
  });
  it('spreads a cron send over the hour: each tick sends only what is due', async () => {
    const db = seed();
    const { d, sent } = deps();
    const r1 = await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: d });
    expect(r1.tally).toMatchObject({ status: 'sending', sent_this_run: 1, waiting: 2, next_due_at: '2026-10-29T15:35:00.000Z' });
    expect(db.tables.a2i_role_alert_deliveries.map((x: any) => x.scheduled_at)).toEqual([
      '2026-10-29T15:05:00.000Z', '2026-10-29T15:35:00.000Z', '2026-10-29T16:05:00.000Z',
    ]);

    const r2 = await runRoleAlert(db.client, { now: new Date('2026-10-29T15:20:00Z'), trigger: 'cron', deps: d });
    expect(r2.tally).toMatchObject({ status: 'sending', sent_this_run: 0, waiting: 2 });

    const r3 = await runRoleAlert(db.client, { now: new Date('2026-10-29T15:35:00Z'), trigger: 'cron', deps: d });
    expect(r3.tally).toMatchObject({ status: 'sending', sent_this_run: 1, waiting: 1 });

    const r4 = await runRoleAlert(db.client, { now: new Date('2026-10-29T16:05:00Z'), trigger: 'cron', deps: d });
    expect(r4.tally).toMatchObject({ status: 'complete', sent_this_run: 1 });
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map(s => s.to)).size).toBe(3);
  });

  it('a later tick never reschedules anyone already queued', async () => {
    const db = seed();
    const { d } = deps();
    await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: d });
    const before = db.tables.a2i_role_alert_deliveries.map((x: any) => [x.email_lower, x.scheduled_at]);
    await runRoleAlert(db.client, { now: new Date('2026-10-29T15:20:00Z'), trigger: 'cron', deps: d });
    expect(db.tables.a2i_role_alert_deliveries.map((x: any) => [x.email_lower, x.scheduled_at])).toEqual(before);
  });

  it('"Send now" during a staggered send sends everyone still waiting at once', async () => {
    const db = seed();
    const { d, sent } = deps();
    await runRoleAlert(db.client, { now: THURSDAY_3PM, trigger: 'cron', deps: d });
    expect(sent).toHaveLength(1);
    const r = await runRoleAlert(db.client, { now: new Date('2026-10-29T15:10:00Z'), trigger: 'manual', deps: d });
    expect(r.tally).toMatchObject({ status: 'complete', sent_this_run: 2 });
    expect(sent).toHaveLength(3);
  });

  it('a send that starts late is squeezed in before the last cron tick', async () => {
    const db = seed();
    const { d, sent } = deps();
    const r = await runHour(db, d, new Date('2026-10-29T17:30:00Z'));
    expect(db.tables.a2i_role_alert_deliveries.map((x: any) => x.scheduled_at)).toEqual([
      '2026-10-29T17:30:00.000Z', '2026-10-29T17:40:00.000Z', '2026-10-29T17:50:00.000Z',
    ]);
    expect(r.tally.status).toBe('complete');
    expect(sent).toHaveLength(3);
  });
});
