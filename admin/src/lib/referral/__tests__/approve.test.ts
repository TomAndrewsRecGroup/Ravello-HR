// Sending by hand must never email someone twice.
//
// The fake keeps real state — the row's status and the email_log — and
// applies conditional updates the way PostgREST does (only rows that
// match every filter change, `count` reports how many). So a claim that
// is not conditional, or a guard that is not checked, fails here the way
// it would fail live.

import { beforeEach, describe, expect, it, vi } from 'vitest';

let sendResult: { sent: boolean; providerId: string | null; error: string | null };
const sends: string[] = [];
let emailLog: { to_email: string; subject: string; error_message: string | null }[] = [];

vi.mock('../pipeline', () => ({
  sendReferralInvite: vi.fn(async (a: { toEmail: string; roleTitle: string }) => {
    sends.push(a.toEmail);
    emailLog.push({ to_email: a.toEmail, subject: `Your ${a.roleTitle} application — next step`, error_message: sendResult.sent ? null : 'refused' });
    return sendResult;
  }),
}));

import { sendInviteForApplication } from '../approve';

type Row = Record<string, any>;
let app: Row;

function fake() {
  function filtered<T extends Row>(rows: T[]) {
    const fs: Array<(r: Row) => boolean> = [];
    const q: any = {
      eq(c: string, v: unknown) { fs.push(r => r[c] === v); return q; },
      is(c: string, v: unknown) { fs.push(r => r[c] === v); return q; },
      match: () => rows.filter(r => fs.every(f => f(r))),
    };
    return q;
  }
  return {
    from(table: string) {
      if (table === 'referral_applications') {
        return {
          select: () => {
            const q = filtered([app]);
            q.single = async () => ({ data: q.match()[0] ?? null, error: q.match()[0] ? null : { message: 'nf' } });
            return q;
          },
          update: (patch: Row) => {
            const q = filtered([app]);
            q.then = (res: any, rej: any) => {
              const hit = q.match();
              hit.forEach((r: Row) => Object.assign(r, patch));
              return Promise.resolve({ error: null, count: hit.length }).then(res, rej);
            };
            return q;
          },
        };
      }
      if (table === 'referral_role_config') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { requisition_id: 'req-1', referral_url: 'https://x.test' }, error: null }) }) }) };
      }
      if (table === 'email_log') {
        return {
          select: () => {
            const q = filtered(emailLog);
            q.then = (res: any, rej: any) => Promise.resolve({ error: null, count: q.match().length }).then(res, rej);
            return q;
          },
        };
      }
      throw new Error(`unexpected ${table}`);
    },
  } as any;
}

beforeEach(() => {
  sends.length = 0;
  emailLog = [];
  sendResult = { sent: true, providerId: 'resend-1', error: null };
  app = {
    id: 'app-1', status: 'qualified', candidate_id: 'c-1', company_id: 'co-1',
    requisition_id: 'req-1', manatal_candidate_id: 'm-1', status_history: [],
    candidate:   { id: 'c-1', full_name: 'Sam Candidate', email: 'sam@example.com' },
    requisition: { id: 'req-1', title: 'AI Engineer' },
  };
});

const opts = { actor: 'staff-1', mode: 'approve' as const };

describe('sendInviteForApplication', () => {
  it('sends once and records email_sent with the provider id', async () => {
    const out = await sendInviteForApplication(fake(), 'app-1', opts);
    expect(out).toEqual({ ok: true, status: 'email_sent' });
    expect(sends).toEqual(['sam@example.com']);
    expect(app.status).toBe('email_sent');
    expect(app.email_provider_id).toBe('resend-1');
    expect(app.status_history.at(-1).from).toBe('qualified');
  });

  it('refuses an address already sent this role’s invite (the 21–24 Sep victims)', async () => {
    emailLog.push({ to_email: 'sam@example.com', subject: 'Your AI Engineer application — next step', error_message: null });
    const out = await sendInviteForApplication(fake(), 'app-1', opts);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.httpStatus).toBe(409);
    expect(sends).toHaveLength(0);
    expect(app.status).toBe('qualified');
  });

  it('a FAILED earlier send does not block a retry', async () => {
    emailLog.push({ to_email: 'sam@example.com', subject: 'Your AI Engineer application — next step', error_message: 'quota' });
    const out = await sendInviteForApplication(fake(), 'app-1', opts);
    expect(out.ok).toBe(true);
    expect(sends).toHaveLength(1);
  });

  it('two clicks on the same row send one email', async () => {
    const f = fake();
    const [a, b] = await Promise.all([
      sendInviteForApplication(f, 'app-1', opts),
      sendInviteForApplication(f, 'app-1', opts),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(sends).toHaveLength(1);
  });

  it('a failed send releases the claim so the row stays outstanding', async () => {
    sendResult = { sent: false, providerId: null, error: 'daily quota' };
    const out = await sendInviteForApplication(fake(), 'app-1', opts);
    expect(out.ok === false && out.httpStatus).toBe(502);
    expect(app.status).toBe('qualified');
  });

  it('refuses a row that is not queued or qualified', async () => {
    app.status = 'email_sent';
    const out = await sendInviteForApplication(fake(), 'app-1', opts);
    expect(out.ok).toBe(false);
    expect(sends).toHaveLength(0);
  });
});
