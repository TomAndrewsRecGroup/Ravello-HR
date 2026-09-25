import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

const sent: { to: string; subject: string; html: string }[] = [];
let sendOk = true;
vi.mock('@/lib/email', async () => {
  const tpl = await import('@/lib/email/templates/notification');
  return {
    ...tpl,
    sendEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return sendOk ? { id: 'r', delivered: true } : null; },
    lastEmailError: () => (sendOk ? null : { status: 500, message: 'down', from: 'x' }),
  };
});

const { runDigest } = await import('../digest');

let db: FakeDb;
const now = new Date('2026-09-25T07:00:00Z');
beforeEach(() => {
  sent.length = 0; sendOk = true;
  db = fakeSupabase({
    profiles: [
      { id: 'staff-1', email: 'tom@example.com', role: 'tps_admin' },
      { id: 'ca', email: 'ca@client.com', role: 'client_admin' },
      { id: 'cb', email: 'cb@client.com', role: 'client_admin' },
    ],
    notification_preferences: [{ user_id: 'ca', email_mode: 'daily', muted_types: ['task_due'], weekly_summary: true }],
    notifications: [
      { id: 'n1', user_id: 'staff-1', type: 'compliance_overdue', title: 'A', body: null, link: '/x', read: false, emailed_at: null, created_at: '2026-09-25T06:00:00Z' },
      { id: 'n2', user_id: 'staff-1', type: 'task_due', title: 'B', body: null, link: null, read: false, emailed_at: '2026-09-24T07:00:00Z', created_at: '2026-09-24T06:00:00Z' },
      { id: 'n3', user_id: 'staff-1', type: 'general', title: 'C', body: null, link: null, read: true, emailed_at: null, created_at: '2026-09-25T06:00:00Z' },
      { id: 'n4', user_id: 'ca', type: 'task_due', title: 'muted', body: null, link: null, read: false, emailed_at: null, created_at: '2026-09-25T06:00:00Z' },
      { id: 'n5', user_id: 'ca', type: 'review_due', title: 'D', body: null, link: '/lead/reviews', read: false, emailed_at: null, created_at: '2026-09-25T06:00:00Z' },
      { id: 'n6', user_id: 'cb', type: 'review_due', title: 'E', body: null, link: null, read: false, emailed_at: null, created_at: '2026-09-25T06:00:00Z' },
    ],
    email_log: [],
  });
});

describe('runDigest', () => {
  it('emails staff (daily by default) and opted-in users the unread, un-emailed items; claims them; skips muted and immediate users', async () => {
    const t = await runDigest(db.client, { now });
    expect(t).toMatchObject({ users: 2, emailed: 2, items: 2, email_failures: 0 });
    expect(sent.map(s => s.to).sort()).toEqual(['ca@client.com', 'tom@example.com']);
    const tom = sent.find(s => s.to === 'tom@example.com')!;
    expect(tom.subject).toBe('Daily summary: 1 update');
    expect(tom.html).toContain('>A<');
    expect(tom.html).not.toContain('>B<');
    expect(tom.html).not.toContain('>C<');
    const ca = sent.find(s => s.to === 'ca@client.com')!;
    expect(ca.html).toContain('D');
    expect(ca.html).not.toContain('muted');
    expect(ca.html).toMatch(/https:\/\/[^"]+\/lead\/reviews/);
    const byId = Object.fromEntries(db.tables.notifications.map(n => [n.id, n]));
    expect(byId.n1.emailed_at).toBeTruthy();
    expect(byId.n5.emailed_at).toBeTruthy();
    expect(byId.n4.emailed_at).toBeNull();
    expect(byId.n6.emailed_at).toBeNull();      // cb is immediate → not in the digest
    const again = await runDigest(db.client, { now });
    expect(again.emailed).toBe(0);
  });

  it('a failed send releases the claim so tomorrow carries the items', async () => {
    sendOk = false;
    const t = await runDigest(db.client, { now });
    expect(t.email_failures).toBe(2);
    expect(db.tables.notifications.find(n => n.id === 'n1')!.emailed_at).toBeNull();
    expect(db.tables.email_log.every(e => e.error_message === 'down')).toBe(true);
  });
});
