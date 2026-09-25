// "Complete with response" used to close a client's service request and
// tell nobody: the serviceRequestResponse template existed and nothing
// called it. These drive the real POST handler and assert what reaches
// the client — the email, who it goes to, the email_log row — and that
// a failed send is REPORTED rather than shown as a silent success.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));
vi.mock('@/lib/rateLimit', () => ({
  limiters: { email: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse:   () => new Response('rate limited', { status: 429 }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/portalUrl', () => ({ portalUrl: () => 'https://portal.example.com' }));

const sent: any[] = [];
let sendOk = true;
vi.mock('@/lib/email', async () => {
  const tpl = await import('@/lib/email/templates/serviceRequestResponse');
  return {
    serviceRequestResponseEmail: tpl.serviceRequestResponseEmail,
    sendEmail: (m: any) => { sent.push(m); return Promise.resolve(sendOk ? { id: 'resend-1', delivered: true } : null); },
    lastEmailError: () => (sendOk ? null : { status: 429, message: 'You have reached your daily email sending quota.', from: 'x' }),
  };
});

const REQ_ID = '11111111-1111-4111-8111-111111111111';
let requestRow: any;
let submitter: any;
let admins: any[];
const updates: any[] = [];
const logs: any[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      const q: any = {};
      let filters: Record<string, any> = {};
      q.select = () => q;
      q.eq = (col: string, val: any) => { filters[col] = val; return q; };
      q.single = async () => {
        if (table === 'service_requests') return requestRow ? { data: requestRow, error: null } : { data: null, error: { message: 'no rows' } };
        if (table === 'companies') return { data: { name: 'Sample Co' }, error: null };
        return { data: null, error: null };
      };
      q.maybeSingle = async () => ({ data: submitter, error: null });
      q.then = (res: any) => res(table === 'profiles' ? { data: admins, error: null } : { data: [], error: null });
      q.update = (patch: any) => {
        updates.push({ table, patch });
        return { eq: () => ({ select: async () => ({ data: requestRow ? [{ id: REQ_ID }] : [], error: null }) }) };
      };
      q.insert = async (row: any) => { logs.push({ table, row }); return { error: null }; };
      return q;
    },
  }),
}));

const { POST } = await import('../route');

function call(body: unknown, id = REQ_ID) {
  const req = new NextRequest(`https://admin.example.com/api/admin/service-requests/${id}/respond`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  sent.length = 0; updates.length = 0; logs.length = 0; sendOk = true;
  requestRow = { id: REQ_ID, company_id: 'co-1', subject: 'Policy <update>', submitted_by: 'p-sub' };
  submitter  = { id: 'p-sub', email: 'raiser@example.com' };
  admins     = [{ id: 'p-adm', email: 'admin@example.com' }];
});

describe('POST /api/admin/service-requests/[id]/respond', () => {
  it('completes the request AND emails the person who raised it', async () => {
    const res = await call({ response_notes: 'Updated policy attached in Documents.' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ saved: true, emailed: 1, email_error: null });
    expect(updates[0].patch).toMatchObject({ status: 'complete', response_notes: 'Updated policy attached in Documents.' });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('raiser@example.com');
    expect(sent[0].html).toContain('Updated policy attached in Documents.');
    expect(sent[0].html).toContain('https://portal.example.com/support');
  });

  it('escapes the client-written subject in the email body', async () => {
    await call({ response_notes: 'Done.' });
    expect(sent[0].html).toContain('Policy &lt;update&gt;');
    expect(sent[0].html).not.toContain('Policy <update>');
  });

  it('logs the send to email_log against the company', async () => {
    await call({ response_notes: 'Done.' });
    const log = logs.find(l => l.table === 'email_log');
    expect(log?.row).toMatchObject({ target_type: 'company', company_id: 'co-1', to_email: 'raiser@example.com', error_message: null, provider_id: 'resend-1' });
  });

  it("falls back to the company's client admins when the raiser has no email", async () => {
    submitter = null;
    await call({ response_notes: 'Done.' });
    expect(sent.map(m => m.to)).toEqual(['admin@example.com']);
  });

  it('reports a failed send instead of a silent success, and logs the failure', async () => {
    sendOk = false;
    const body = await (await call({ response_notes: 'Done.' })).json();
    expect(body.saved).toBe(true);
    expect(body.emailed).toBe(0);
    expect(body.email_error).toContain('daily email sending quota');
    expect(logs.find(l => l.table === 'email_log')?.row.error_message).toContain('quota');
  });

  it('refuses an empty response (there would be nothing to email)', async () => {
    const res = await call({ response_notes: '   ' });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('404s an unknown request without emailing anyone', async () => {
    requestRow = null;
    const res = await call({ response_notes: 'Done.' });
    expect(res.status).toBe(404);
    expect(sent).toHaveLength(0);
  });
});
