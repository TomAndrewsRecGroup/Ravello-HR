import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '@/lib/events/__tests__/fakeSupabase';
import { JOB_AUTOMATION_ENGINEER } from '@/lib/a2iRoles/__tests__/fixtures';

// The staff actions route. The property that matters most: nothing here
// can email anyone except an athlete or the person pressing the button.

let db: ReturnType<typeof fakeSupabase>;
let staff: { ok: true; role: 'tps_admin'; userId: string } | { ok: false; response: Response };
const smtpSends: Array<{ to: string; subject: string }> = [];

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: async () => staff }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => db.client }));
vi.mock('@/lib/automation/runs', () => ({ serviceClient: () => db.client }));
vi.mock('@/lib/manatal', () => ({
  listLiveManatalJobs: async () => ({ jobs: [JOB_AUTOMATION_ENGINEER], truncated: false, error: null }),
  getManatalOrganizationName: async () => null,
}));
vi.mock('@/lib/email/smtp', () => ({
  decryptSmtpPassword: () => 'pw',
  createSmtpSession: () => ({
    verify: async () => ({ ok: true }),
    send: async (input: { to: string; subject: string }) => { smtpSends.push(input); return { ok: true, messageId: 'm' }; },
    close: () => {},
  }),
}));
vi.mock('@/lib/audit', () => ({ auditLog: () => {} }));

const { POST } = await import('../route');

const call = (body: unknown) => POST(new Request('https://admin.example.com/api/admin/a2i-roles', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => {
  smtpSends.length = 0;
  process.env.NEXT_PUBLIC_PORTAL_URL = 'https://portal.thepeoplesystem.co.uk';
  staff = { ok: true, role: 'tps_admin', userId: 'me' };
  db = fakeSupabase({
    a2i_role_alert_config: [{ id: 'cfg', singleton: true, enabled: false, recipient_mode: 'all', sender_profile_id: 'tom',
      role_url_template: 'https://www.andrews-recruitment.com/jobs/{id}', notify_email: 'tom@andrews-recruitment.com', updated_by: null }],
    profiles: [
      { id: 'me', role: 'tps_admin', email: 'staff.member@example.com', full_name: 'Staff Member' },
      { id: 'tom', role: 'tps_admin', email: 'tom@andrews-recruitment.com', full_name: 'Tom Andrews',
        smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false, smtp_user: 'tom',
        smtp_pass_enc: 'enc', smtp_from_name: 'Tom Andrews', smtp_from_email: 'tom@andrews-recruitment.com', smtp_reply_to: null },
    ],
    athletes: [{ id: 'a1', full_name: 'Sam Rivers', email: 'sam@example.com', company_id: 'c1' }],
    a2i_role_alert_optouts: [], a2i_role_alert_recipients: [], companies: [],
  });
});

describe('POST /api/admin/a2i-roles', () => {
  it('refuses non-staff', async () => {
    staff = { ok: false, response: new Response('{}', { status: 403 }) };
    const res = await call({ action: 'test' });
    expect(res.status).toBe(403);
    expect(smtpSends).toHaveLength(0);
  });

  it('"Send test to me" goes only to the signed-in staff member and the fixed test address, whatever the body says', async () => {
    const res = await call({ action: 'test', to: 'someone.else@example.com' });
    expect(res.status).toBe(200);
    expect(smtpSends.map(s => s.to)).toEqual(['staff.member@example.com', 'tomandrews1240@gmail.com']);
    expect(smtpSends.every(s => s.subject.startsWith('[Test] '))).toBe(true);
    expect((await res.json()).to).toEqual(['staff.member@example.com', 'tomandrews1240@gmail.com']);
  });

  it('send now needs an explicit confirm', async () => {
    const res = await call({ action: 'send_now' });
    expect(res.status).toBe(400);
    expect(smtpSends).toHaveLength(0);
  });

  it('send now emails athletes only', async () => {
    const res = await call({ action: 'send_now', confirm: true });
    expect(res.status).toBe(200);
    expect(smtpSends.map(s => s.to)).toEqual(['sam@example.com']);
  });

  it('rejects a role link that is not https or has no {id}', async () => {
    expect((await call({ action: 'save_config', role_url_template: 'http://x.example/jobs/{id}' })).status).toBe(400);
    expect((await call({ action: 'save_config', role_url_template: 'https://x.example/jobs/' })).status).toBe(400);
    expect((await call({ action: 'save_config', role_url_template: 'https://x.example/jobs/{id}' })).status).toBe(200);
  });

  it('staff opt-out is by email and blocks the next send', async () => {
    expect((await call({ action: 'set_optout', athlete_id: '00000000-0000-4000-8000-000000000001', opted_out: true })).status).toBe(400);
    db.tables.athletes[0].id = '00000000-0000-4000-8000-000000000001';
    expect((await call({ action: 'set_optout', athlete_id: '00000000-0000-4000-8000-000000000001', opted_out: true })).status).toBe(200);
    expect(db.tables.a2i_role_alert_optouts).toMatchObject([{ email_lower: 'sam@example.com', source: 'staff' }]);
    await call({ action: 'send_now', confirm: true });
    expect(smtpSends).toHaveLength(0);
  });
});
