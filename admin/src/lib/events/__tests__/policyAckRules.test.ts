import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, eventRow, type FakeDb } from './fakeSupabase';
import { hashAccessToken } from '@/lib/auth/accessTokens';

// "Request sign-off" wrote a row and sent nothing. Now the consumer
// emails the employee a personal link: once per event (a re-processed
// event sends nothing), a fresh link per resend and per weekly overdue
// nudge, the old links burned each time; an employee with no email gets
// no link and the admins are told; a link-signed row tells the admins.

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email', async () => {
  const n = await import('@/lib/email/templates/notification');
  const sr = await import('@/lib/email/templates/serviceRequestReceived');
  const h = await import('@/lib/email/templates/hsCheckFailed');
  const l = await import('@/lib/email/templates/leave');
  const pa = await import('@/lib/email/templates/policyAck');
  return { ...n, ...sr, ...h, ...l, ...pa, sendEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return { id: 'r', delivered: true }; }, lastEmailError: () => null };
});
vi.mock('@/lib/jev/transport', async () => {
  const real = await vi.importActual<typeof import('@/lib/jev/transport')>('@/lib/jev/transport');
  return { ...real, sendToJev: async () => ({ status: 200, payload: null, error: null, durationMs: 1 }) };
});
vi.mock('@/lib/portalUrl', () => ({ portalUrl: () => 'https://portal.example.com' }));

const { processEvents } = await import('../process');
const { RULES } = await import('../rules');

let db: FakeDb;
let nextId = 700;
beforeEach(() => {
  sent.length = 0;
  delete process.env.JEV_API_KEY;
  db = fakeSupabase({
    profiles: [
      { id: 'staff-1', email: 'tom@example.com', role: 'tps_admin' },
      { id: 'ca', email: 'ca@client.com', role: 'client_admin', company_id: 'co-1' },
    ],
    companies: [{ id: 'co-1', name: 'Sample Co', account_owner_id: null, feature_flags: {} }],
    employee_records: [
      { id: 'emp-1', company_id: 'co-1', full_name: 'Ada Lovelace', email: 'ada@x.com', status: 'active' },
      { id: 'emp-2', company_id: 'co-1', full_name: 'No Mail', email: null, status: 'active' },
    ],
    documents: [{ id: 'doc-1', company_id: 'co-1', name: 'Remote Working Policy', category: 'policy', version: 2 }],
    policy_acknowledgements: [
      { id: 'ack-1', company_id: 'co-1', document_id: 'doc-1', employee_id: 'emp-1', status: 'pending', link_sent_at: null },
      { id: 'ack-2', company_id: 'co-1', document_id: 'doc-1', employee_id: 'emp-2', status: 'pending', link_sent_at: null },
    ],
    policy_ack_tokens: [], platform_events: [], notifications: [], email_log: [], jev_decisions: [],
  });
});
afterEach(() => { delete process.env.JEV_API_KEY; });

const push = (over: Parameters<typeof eventRow>[0]) => db.tables.platform_events.push(eventRow({ id: nextId++, ...over }));
const run = () => processEvents(db.client, { rules: RULES });
const notes = (type: string) => db.tables.notifications.filter(n => n.type === type);
// the admins' own immediate emails are not the employee's link
const toEmployee = () => sent.filter(m => m.to === 'ada@x.com');
const created = (ackId: string, employeeId: string) => push({ entity_type: 'policy_acknowledgements', event_type: 'created', entity_id: ackId, actor_kind: 'client',
  payload: { new: { status: 'pending', document_id: 'doc-1', employee_id: employeeId }, old: {}, changed: [] } });
const tokenInLink = (html: string) => /\/policy\/([0-9a-f-]{36})/.exec(html)?.[1] ?? null;

describe('a sign-off request', () => {
  it('emails the employee a personal link whose hash is stored, stamps link_sent_at, and a re-processed event sends nothing', async () => {
    created('ack-1', 'emp-1');
    const t = await run();
    expect(t.failed, JSON.stringify(t.errors)).toBe(0);
    expect(toEmployee()).toHaveLength(1);
    expect(toEmployee()[0]).toMatchObject({ to: 'ada@x.com', subject: 'Please acknowledge: Remote Working Policy' });
    expect(toEmployee()[0].html).toContain('Sample Co');
    const token = tokenInLink(toEmployee()[0].html)!;
    expect(token).toBeTruthy();
    expect(db.tables.policy_ack_tokens).toHaveLength(1);
    expect(db.tables.policy_ack_tokens[0]).toMatchObject({ acknowledgement_id: 'ack-1', token_hash: await hashAccessToken(token) });
    expect(db.tables.policy_acknowledgements[0].link_sent_at).toBeTruthy();
    expect(db.tables.email_log[0]).toMatchObject({ target_type: 'employee', target_id: 'emp-1', error_message: null });

    db.tables.platform_events[0].processed_at = null; db.tables.platform_events[0].claimed_at = null;
    await run();
    expect(toEmployee()).toHaveLength(1);
    expect(db.tables.policy_ack_tokens).toHaveLength(1);   // the unused re-mint was burned, the emailed link still works
    expect(db.tables.policy_ack_tokens[0].token_hash).toBe(await hashAccessToken(token));
  });

  it('with no email on the record sends nothing and tells the admins, once', async () => {
    created('ack-2', 'emp-2');
    await run();
    expect(toEmployee()).toHaveLength(0);
    expect(sent.map(m => m.to)).toEqual(['ca@client.com']);   // the admin, told
    expect(db.tables.policy_ack_tokens).toHaveLength(0);
    expect(notes('policy_ack_needs_email').map(n => [n.user_id, n.link])).toEqual([['ca', '/lead/employee-records']]);
    expect(notes('policy_ack_needs_email')[0].title).toMatch(/^No Mail has no email address/);
    push({ entity_type: 'policy_ack_resend', event_type: 'created', entity_id: 'ack-2', actor_kind: 'client', payload: {} });
    await run();
    expect(notes('policy_ack_needs_email')).toHaveLength(1);
  });

  it('a resend and a weekly overdue nudge each email a FRESH link and burn the old one; a re-request after signing does too', async () => {
    created('ack-1', 'emp-1');
    await run();
    const first = tokenInLink(toEmployee()[0].html)!;
    push({ entity_type: 'policy_ack_resend', event_type: 'created', entity_id: 'ack-1', actor_kind: 'client', payload: {} });
    await run();
    expect(toEmployee()).toHaveLength(2);
    expect(toEmployee()[1].subject).toBe('Reminder: Please acknowledge: Remote Working Policy');
    const second = tokenInLink(toEmployee()[1].html)!;
    expect(second).not.toBe(first);
    expect(db.tables.policy_ack_tokens.map(t => t.token_hash)).toEqual([await hashAccessToken(second)]);

    db.tables.policy_acknowledgements[0].status = 'overdue';
    push({ entity_type: 'policy_acknowledgements', event_type: 'reminder', entity_id: 'ack-1', payload: { bucket: 'overdue', due_date: '2026-09-20', row: { employee_id: 'emp-1', document_id: 'doc-1', sent_at: '2026-09-01' } } });
    await run();
    expect(toEmployee()).toHaveLength(3);
    expect(toEmployee()[2].subject).toMatch(/^Reminder: /);
    expect(notes('policy_ack_overdue').map(n => n.user_id)).toEqual(['ca']);   // the PR 1 admin notice still fires

    // the admin re-requests (the upsert sets a signed row back to pending)
    db.tables.policy_acknowledgements[0].status = 'pending';
    push({ entity_type: 'policy_acknowledgements', event_type: 'updated', entity_id: 'ack-1', actor_kind: 'client', payload: { new: { status: 'pending', document_id: 'doc-1', employee_id: 'emp-1' }, old: { status: 'acknowledged' }, changed: ['status'] } });
    await run();
    expect(toEmployee()).toHaveLength(4);
    expect(toEmployee()[3].subject).toBe('Please acknowledge: Remote Working Policy');
  });

  it('a row that is already signed gets no link', async () => {
    db.tables.policy_acknowledgements[0].status = 'acknowledged';
    push({ entity_type: 'policy_ack_resend', event_type: 'created', entity_id: 'ack-1', actor_kind: 'client', payload: {} });
    await run();
    expect(toEmployee()).toHaveLength(0);
    expect(db.tables.policy_ack_tokens).toHaveLength(0);
  });

  it('signing through the link tells the admins; an admin marking it signed on their behalf does not', async () => {
    const signed = (actor: 'system' | 'client') => push({ entity_type: 'policy_acknowledgements', event_type: 'updated', entity_id: 'ack-1', actor_kind: actor,
      payload: { new: { status: 'acknowledged', document_id: 'doc-1', employee_id: 'emp-1', acknowledged_at: '2026-09-25T10:00:00Z' }, old: { status: 'pending' }, changed: ['status', 'acknowledged_at'] } });
    signed('client');
    await run();
    expect(notes('policy_ack_signed')).toHaveLength(0);
    signed('system');
    await run();
    expect(notes('policy_ack_signed').map(n => [n.user_id, n.title, n.link])).toEqual([['ca', 'Ada Lovelace acknowledged Remote Working Policy', '/lead/policy-acknowledgements']]);
  });
});
