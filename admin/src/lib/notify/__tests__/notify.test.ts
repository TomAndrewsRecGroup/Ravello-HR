import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeDb } from '@/lib/events/__tests__/fakeSupabase';

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email', async () => {
  const tpl = await import('@/lib/email/templates/notification');
  return {
    ...tpl,
    sendEmail: async (m: { to: string; subject: string; html: string }) => { sent.push(m); return { id: 'r', delivered: true }; },
    lastEmailError: () => null,
  };
});

const { notify, resolveRecipients, shouldEmailNow, defaultEmailMode, absoluteLink } = await import('../notify');

let db: FakeDb;
beforeEach(() => {
  sent.length = 0;
  db = fakeSupabase({
    profiles: [
      { id: 'staff-1', email: 'tom@example.com',  role: 'tps_admin',    company_id: null },
      { id: 'demo',    email: 'demo@example.com', role: 'tps_client',   company_id: null },
      { id: 'ca',      email: 'ca@client.com',    role: 'client_admin', company_id: 'co-1' },
      { id: 'ce',      email: 'ce@client.com',    role: 'client_editor', company_id: 'co-1' },
      { id: 'cu',      email: 'cu@client.com',    role: 'client_user',  company_id: 'co-1' },
      { id: 'other',   email: 'x@other.com',      role: 'client_admin', company_id: 'co-2' },
    ],
    companies: [{ id: 'co-1', name: 'Sample Co', account_owner_id: 'staff-1' }, { id: 'co-3', name: 'Orphan', account_owner_id: 'demo' }],
    notification_preferences: [],
    notifications: [], email_log: [],
  });
});

describe('audiences', () => {
  it('staff is tps_admin only', async () => {
    expect((await resolveRecipients(db.client, [{ kind: 'staff' }])).map(r => r.id)).toEqual(['staff-1']);
  });
  it('company_admins excludes editors and users and other companies; editors adds client_editor', async () => {
    expect((await resolveRecipients(db.client, [{ kind: 'company_admins', companyId: 'co-1' }])).map(r => r.id)).toEqual(['ca']);
    expect((await resolveRecipients(db.client, [{ kind: 'company_editors', companyId: 'co-1' }])).map(r => r.id).sort()).toEqual(['ca', 'ce']);
  });
  it('account_owner falls back to staff when unset or no longer staff', async () => {
    expect((await resolveRecipients(db.client, [{ kind: 'account_owner', companyId: 'co-1' }])).map(r => r.id)).toEqual(['staff-1']);
    expect((await resolveRecipients(db.client, [{ kind: 'account_owner', companyId: 'co-3' }])).map(r => r.id)).toEqual(['staff-1']);
    expect((await resolveRecipients(db.client, [{ kind: 'account_owner', companyId: 'nope' }])).map(r => r.id)).toEqual(['staff-1']);
  });
  it('deduplicates across audiences', async () => {
    const r = await resolveRecipients(db.client, [{ kind: 'staff' }, { kind: 'user', userId: 'staff-1' }]);
    expect(r).toHaveLength(1);
  });
});

describe('email decision', () => {
  it('staff default to daily, clients to immediate', () => {
    expect(defaultEmailMode('tps_admin')).toBe('daily');
    expect(defaultEmailMode('client_admin')).toBe('immediate');
  });
  it('daily emails only urgent items now; off never', () => {
    expect(shouldEmailNow('immediate', false)).toBe(true);
    expect(shouldEmailNow('daily', false)).toBe(false);
    expect(shouldEmailNow('daily', true)).toBe(true);
    expect(shouldEmailNow('off', true)).toBe(false);
  });
  it('links are per app', () => {
    const link = { admin: '/requests', portal: '/support' };
    expect(absoluteLink({ id: 'a', email: null, role: 'tps_admin', app: 'admin' }, link)).toMatch(/\/requests$/);
    expect(absoluteLink({ id: 'b', email: null, role: 'client_admin', app: 'portal' }, link)).toMatch(/\/support$/);
    expect(absoluteLink({ id: 'b', email: null, role: 'client_admin', app: 'portal' }, { admin: '/x' })).toBeNull();
  });
});

describe('notify', () => {
  const base = { companyId: 'co-1', type: 'compliance_overdue' as const, title: 'Fire check overdue', link: { admin: '/a', portal: '/p' }, dedupeKey: 'k' };

  it('writes one row per recipient with the app-specific link, emails immediate recipients, and dedupes on repeat', async () => {
    const t1 = await notify(db.client, { ...base, audiences: [{ kind: 'staff' }, { kind: 'company_admins', companyId: 'co-1' }] });
    expect(t1).toMatchObject({ recipients: 2, notified: 2, emailed: 1 });   // staff daily → not now; client immediate
    expect(db.tables.notifications.map(n => [n.user_id, n.link])).toEqual([['staff-1', '/a'], ['ca', '/p']]);
    expect(sent.map(s => s.to)).toEqual(['ca@client.com']);
    const t2 = await notify(db.client, { ...base, audiences: [{ kind: 'staff' }, { kind: 'company_admins', companyId: 'co-1' }] });
    expect(t2).toMatchObject({ notified: 0, emailed: 0 });
    expect(db.tables.notifications).toHaveLength(2);
  });

  it('a muted type is in-app only; urgent reaches a daily user at once', async () => {
    db.tables.notification_preferences.push({ user_id: 'ca', email_mode: 'immediate', muted_types: ['compliance_overdue'], weekly_summary: true });
    await notify(db.client, { ...base, urgent: true, audiences: [{ kind: 'staff' }, { kind: 'company_admins', companyId: 'co-1' }] });
    expect(sent.map(s => s.to)).toEqual(['tom@example.com']);
    expect(db.tables.notifications).toHaveLength(2);
  });

  it('the email is built from the notification data and carries the absolute link', async () => {
    await notify(db.client, { ...base, body: 'Due 1 Sep', audiences: [{ kind: 'company_admins', companyId: 'co-1' }] });
    expect(sent[0].subject).toBe('Fire check overdue');
    expect(sent[0].html).toContain('Due 1 Sep');
    expect(sent[0].html).toMatch(/href="https:\/\/[^"]+\/p"/);
  });
});
