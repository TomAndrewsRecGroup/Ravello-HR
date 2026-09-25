import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';
import type { Rule } from '../rules';

// Drives processEvents() against a stateful fake with the real
// notify(). What it pins: one notification per staff member with a
// dedupe key; a second run of the same event inserts nothing and
// emails nobody; a thrown consequence leaves the event unprocessed with
// last_error; a failed send releases the claim and is counted.

const sent: { to: string; subject: string }[] = [];
let sendOk = true;
vi.mock('@/lib/email', async () => {
  const tpl = await import('@/lib/email/templates/notification');
  const sr = await import('@/lib/email/templates/serviceRequestReceived');
  return {
    ...tpl, ...sr,
    sendEmail: async (m: { to: string; subject: string }) => { sent.push({ to: m.to, subject: m.subject }); return sendOk ? { id: 'r1', delivered: true } : null; },
    lastEmailError: () => (sendOk ? null : { status: 429, message: 'quota', from: 'x' }),
  };
});

const { processEvents } = await import('../process');
const { RULES } = await import('../rules');

let db: FakeDb;

beforeEach(() => {
  sent.length = 0; sendOk = true;
  db = fakeSupabase({
    profiles: [
      { id: 'staff-1', email: 'tom@example.com', role: 'tps_admin', company_id: null },
      { id: 'staff-2', email: 'lucy@example.com', role: 'tps_admin', company_id: null },
      { id: 'demo',    email: 'demo@example.com', role: 'tps_client', company_id: null },
      { id: 'client-1', email: 'boss@client.com', role: 'client_admin', company_id: 'co-1' },
    ],
    companies: [{ id: 'co-1', name: 'Sample Co', account_owner_id: null }],
    notification_preferences: [{ user_id: 'staff-1', email_mode: 'immediate', muted_types: [], weekly_summary: true }],
    platform_events: [],
    notifications: [],
    email_log: [],
  });
});

const roleRaised = () => eventRow({
  id: 1, entity_type: 'requisitions', event_type: 'created', actor_kind: 'client', entity_id: 'req-1',
  payload: { new: { title: 'Engineer' }, old: {}, changed: [] },
});

describe('processEvents', () => {
  it('notifies every staff member once, with a dedupe key; a client-raised role is urgent so both are emailed at once', async () => {
    db.tables.platform_events.push(roleRaised());
    const t = await processEvents(db.client);
    expect(t).toMatchObject({ claimed: 1, processed: 1, failed: 0, notified: 2, emailed: 2, email_failures: 0 });
    const notes = db.tables.notifications;
    expect(notes.map(n => n.user_id).sort()).toEqual(['staff-1', 'staff-2']);   // never tps_client
    expect(notes.map(n => n.dedupe_key)).toEqual(['role_raised:1:0:staff-1', 'role_raised:1:0:staff-2']);
    expect(notes.every(n => n.type === 'role_pending_approval' && n.link === '/hiring/req-1')).toBe(true);
    // staff-2 has no preference row → daily by default; the rule is urgent → emailed now anyway
    expect(sent.map(s => s.subject)).toEqual(['New role awaiting approval: Engineer', 'New role awaiting approval: Engineer']);
    expect(sent.map(s => s.to).sort()).toEqual(['lucy@example.com', 'tom@example.com']);
    expect(notes.every(n => n.emailed_at)).toBe(true);
    expect(db.tables.platform_events[0].processed_at).toBeTruthy();
    expect(db.tables.email_log).toHaveLength(2);
    expect(db.tables.email_log[0]).toMatchObject({ target_type: 'user', profile_id: 'staff-1', error_message: null, provider_id: 'r1' });
  });

  it('a non-urgent notification reaches a daily-mode staff member in-app only', async () => {
    db.tables.platform_events.push(eventRow({
      id: 2, entity_type: 'actions', event_type: 'updated', actor_kind: 'client',
      payload: { new: { status: 'complete', title: 'Sign the policy' }, old: { status: 'active' }, changed: ['status'] },
    }));
    const t = await processEvents(db.client);
    expect(t).toMatchObject({ notified: 2, emailed: 1 });
    expect(sent.map(s => s.to)).toEqual(['tom@example.com']);   // tom is immediate; lucy waits for the digest
    expect(db.tables.notifications.find(n => n.user_id === 'staff-2')!.emailed_at ?? null).toBeNull();
  });

  it('re-processing the same event inserts nothing and emails nobody', async () => {
    db.tables.platform_events.push(roleRaised());
    await processEvents(db.client);
    db.tables.platform_events[0].processed_at = null;   // simulate a crash after the consequences ran
    db.tables.platform_events[0].claimed_at = null;
    const t = await processEvents(db.client);
    expect(t.notified).toBe(0);
    expect(t.emailed).toBe(0);
    expect(db.tables.notifications).toHaveLength(2);
    expect(sent).toHaveLength(2);
  });

  it('a failed send releases the claim, is counted, and is recorded in email_log', async () => {
    sendOk = false;
    db.tables.platform_events.push(roleRaised());
    const t = await processEvents(db.client);
    expect(t).toMatchObject({ processed: 1, emailed: 0, email_failures: 2 });
    expect(db.tables.notifications.every(n => n.emailed_at === null)).toBe(true);
    expect(db.tables.email_log[0]).toMatchObject({ error_message: 'quota', provider_id: null });
  });

  it('a consequence that throws leaves the event unprocessed with last_error, and the next run retries it', async () => {
    let calls = 0;
    const rules: Rule[] = [{
      id: 'boom', on: 'requisitions.created',
      then: () => { calls++; if (calls === 1) throw new Error('vendor down'); return []; },
    }];
    db.tables.platform_events.push(roleRaised());
    const t1 = await processEvents(db.client, { rules });
    expect(t1).toMatchObject({ claimed: 1, processed: 0, failed: 1 });
    expect(db.tables.platform_events[0]).toMatchObject({ processed_at: null, attempts: 1, last_error: 'vendor down' });

    // lease not expired → not re-claimed
    const t2 = await processEvents(db.client, { rules });
    expect(t2.claimed).toBe(0);

    db.tables.platform_events[0].claimed_at = new Date(Date.now() - 3600_000).toISOString();
    const t3 = await processEvents(db.client, { rules });
    expect(t3).toMatchObject({ claimed: 1, processed: 1, failed: 0 });
    expect(db.tables.platform_events[0].last_error).toBeNull();
  });

  it('gives up after five attempts so a poison event cannot block the queue', async () => {
    db.tables.platform_events.push({ ...roleRaised(), attempts: 5 });
    const t = await processEvents(db.client);
    expect(t.claimed).toBe(0);
  });

  it('an email consequence claims its email_log row first, so a retry cannot send twice', async () => {
    db.tables.profiles.push({ id: 'raiser', email: 'raiser@client.com', role: 'client_user', company_id: 'co-1' });
    db.tables.platform_events.push(eventRow({
      id: 7, entity_type: 'service_requests', event_type: 'created', actor_kind: 'client',
      payload: { new: { subject: 'Contract', request_type: 'hr_audit', submitted_by: 'raiser' }, old: {}, changed: [] },
    }));
    await processEvents(db.client);
    // No account owner → all staff; the request is urgent, so even the
    // daily-mode staff member is emailed now. Plus the raiser's receipt.
    expect(sent.map(s => s.to).sort()).toEqual(['lucy@example.com', 'raiser@client.com', 'tom@example.com']);
    expect(db.tables.email_log.filter(e => e.dedupe_key === 'service_request_raised:7:1')).toHaveLength(1);

    db.tables.platform_events[0].processed_at = null; db.tables.platform_events[0].claimed_at = null;
    const before = sent.length;
    await processEvents(db.client);
    expect(sent.length).toBe(before);
  });

  it('uses the real RULES for the service request path: owner notified urgently, raiser receipted', async () => {
    db.tables.profiles.push({ id: 'raiser', email: 'raiser@client.com', role: 'client_user', company_id: 'co-1' });
    db.tables.platform_events.push(eventRow({
      id: 8, entity_type: 'service_requests', event_type: 'created', actor_kind: 'client',
      payload: { new: { subject: 'Contract', request_type: 'hr_audit', submitted_by: 'raiser' }, old: {}, changed: [] },
    }));
    const t = await processEvents(db.client, { rules: RULES });
    expect(t.notified).toBe(2);           // no account owner → all staff
    expect(sent.map(s => s.to).sort()).toEqual(['lucy@example.com', 'raiser@client.com', 'tom@example.com']);
    expect(sent.find(s => s.to === 'raiser@client.com')!.subject).toBe('Received: Contract');
  });
});
