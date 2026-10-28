import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashAccessToken } from '@/lib/auth/accessTokens';

// The public "Match me" route and its unsubscribe sibling, driven against
// a small stateful fake with the real UNIQUE constraints from 217.
// The properties: a GET records nothing and never shows the client name;
// a POST records one request and emails Tom once, with Reply-To set to
// the athlete; a second press sends nothing; expired and unknown links
// are refused; unsubscribe works even on an expired link.

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const emails: Array<{ to: string; subject: string; html: string; replyTo?: string }> = [];
let emailOk = true;

const UNIQUE: Record<string, string[]> = { a2i_role_interests: ['athlete_id', 'manatal_job_id'], a2i_role_alert_optouts: ['email_lower'] };

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
  let patch: Row = {}; let payload: Row[] = []; let single: 'one' | 'maybe' | null = null; let ignoreDup = false; let returning = false;
  const q: any = {
    select() { if (op !== 'select') returning = true; return q; },
    insert(rows: Row | Row[]) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return q; },
    upsert(rows: Row | Row[], o?: { ignoreDuplicates?: boolean }) { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; ignoreDup = !!o?.ignoreDuplicates; return q; },
    update(p: Row) { op = 'update'; patch = p; return q; },
    eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q; },
    single() { single = 'one'; return q; },
    maybeSingle() { single = 'maybe'; return q; },
    then(res: any, rej?: any) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    const rows = (tables[name] ??= []);
    const keys = UNIQUE[name] ?? [];
    const clash = (r: Row) => keys.length > 0 && rows.some(e => keys.every(k => e[k] === r[k]));
    if (op === 'insert' || op === 'upsert') {
      const added: Row[] = [];
      for (const r of payload) {
        if (clash(r)) {
          if (op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' } };
          if (ignoreDup) continue;
        }
        const row = { id: `${name}-${rows.length + 1}`, ...r };
        rows.push(row); added.push(row);
      }
      const data = returning ? (single ? added[0] ?? null : added) : null;
      return { data, error: null };
    }
    const hit = rows.filter(r => filters.every(f => f(r)));
    if (op === 'update') { hit.forEach(r => Object.assign(r, patch)); return { data: null, error: null, count: hit.length }; }
    return { data: single ? hit[0] ?? null : hit, error: null };
  }
  return q;
}

vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/rateLimit', () => ({ createRateLimiter: () => ({ check: () => ({ allowed: true, resetAt: 0 }) }), getRateLimitKey: () => 'ip' }));
vi.mock('@/lib/email', async (orig) => {
  const real = await orig<typeof import('@/lib/email')>();
  return {
    ...real,
    sendEmail: async (e: any) => { if (!emailOk) return null; emails.push(e); return { id: 'r1', delivered: true }; },
    lastEmailError: () => ({ status: 500, message: 'Resend down', from: 'x' }),
  };
});

const match = await import('../route');
const unsub = await import('../../../unsubscribe/route');

const TOKEN = '11111111-2222-4333-8444-555555555555';
const EXPIRED = '99999999-2222-4333-8444-555555555555';
const req = (method: string, url: string, body?: unknown) => new NextRequest(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const mctx = (token: string, jobId: string) => ({ params: Promise.resolve({ token, jobId }) });
const uctx = (token: string) => ({ params: Promise.resolve({ token }) });
const matchUrl = (t: string, j: string) => `https://portal.example.com/api/r/roles/${t}/match/${j}`;

beforeEach(async () => {
  emails.length = 0;
  emailOk = true;
  tables = {
    a2i_role_alert_tokens: [
      { token_hash: await hashAccessToken(TOKEN), delivery_id: 'd1', send_id: 's1', athlete_id: 'a1', email_lower: 'sam@example.com', expires_at: '2099-01-01T00:00:00Z' },
      { token_hash: await hashAccessToken(EXPIRED), delivery_id: 'd2', send_id: 's1', athlete_id: 'a1', email_lower: 'sam@example.com', expires_at: '2020-01-01T00:00:00Z' },
    ],
    a2i_role_alert_sends: [{ id: 's1', jobs: [
      { id: '4467043', title: 'Automation Engineer', location: 'Macclesfield', contract: 'Full-time', salary: null, industry: 'Building Materials', summary: 'Are you an Automation Engineer…', clientName: 'Tarmac', organizationId: '4247425', openAt: null },
    ] }],
    a2i_role_alert_config: [{ singleton: true, role_url_template: 'https://www.andrews-recruitment.com/jobs/{id}', notify_email: 'tom@andrews-recruitment.com' }],
    athletes: [{ id: 'a1', full_name: 'Sam Rivers', email: 'Sam@Example.com', phone: '07700 900123', sport: 'Rugby', previous_role: null,
      linkedin_url: 'https://linkedin.com/in/sam', bio: 'Former winger.', company_id: 'c1', cv_url: null, cv_storage_path: 'c1/a1/cv.pdf', cv_text: null }],
    companies: [{ id: 'c1', name: 'Old Albanians Rugby' }],
    a2i_role_interests: [],
    a2i_role_alert_optouts: [],
  };
});

describe('GET /api/r/roles/[token]/match/[jobId]', () => {
  it('shows the role and records nothing — and never the client name', async () => {
    const res = await match.GET(req('GET', matchUrl(TOKEN, '4467043')), mctx(TOKEN, '4467043'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ firstName: 'Sam', alreadyMatched: false, roleUrl: 'https://www.andrews-recruitment.com/jobs/4467043' });
    expect(body.role.title).toBe('Automation Engineer');
    expect(JSON.stringify(body)).not.toMatch(/Tarmac|4247425|sam@example|07700/i);
    expect(tables.a2i_role_interests).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });

  it('refuses a role that was not in this email, an unknown link and an expired one', async () => {
    expect((await match.GET(req('GET', matchUrl(TOKEN, '1')), mctx(TOKEN, '1'))).status).toBe(404);
    const unknown = '22222222-2222-4333-8444-555555555555';
    expect((await match.GET(req('GET', matchUrl(unknown, '4467043')), mctx(unknown, '4467043'))).status).toBe(404);
    expect((await match.GET(req('GET', matchUrl('not-a-token', '4467043')), mctx('not-a-token', '4467043'))).status).toBe(404);
    expect((await match.GET(req('GET', matchUrl(EXPIRED, '4467043')), mctx(EXPIRED, '4467043'))).status).toBe(410);
  });
});

describe('POST /api/r/roles/[token]/match/[jobId]', () => {
  it('records the request and emails Tom once, Reply-To the athlete', async () => {
    const res = await match.POST(req('POST', matchUrl(TOKEN, '4467043'), { note: 'Free from next month' }), mctx(TOKEN, '4467043'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, already: false });
    expect(tables.a2i_role_interests).toMatchObject([{ athlete_id: 'a1', manatal_job_id: '4467043', position_name: 'Automation Engineer', note: 'Free from next month', send_id: 's1' }]);
    expect(tables.a2i_role_interests[0].notified_at).toBeTruthy();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: 'tom@andrews-recruitment.com', replyTo: 'Sam@Example.com' });
    expect(emails[0].subject).toBe('Match me: Sam Rivers → Automation Engineer (Manatal #4467043)');
    // Tom's internal email DOES name the client and carries the details.
    expect(emails[0].html).toContain('Tarmac');
    expect(emails[0].html).toContain('07700 900123');
    expect(emails[0].html).toContain('Old Albanians Rugby');
    expect(emails[0].html).toContain('Free from next month');
  });

  it('a second press sends nothing more', async () => {
    await match.POST(req('POST', matchUrl(TOKEN, '4467043'), {}), mctx(TOKEN, '4467043'));
    const again = await match.POST(req('POST', matchUrl(TOKEN, '4467043'), {}), mctx(TOKEN, '4467043'));
    expect(await again.json()).toEqual({ ok: true, already: true });
    expect(tables.a2i_role_interests).toHaveLength(1);
    expect(emails).toHaveLength(1);
  });

  it('an expired link cannot match', async () => {
    const res = await match.POST(req('POST', matchUrl(EXPIRED, '4467043'), {}), mctx(EXPIRED, '4467043'));
    expect(res.status).toBe(410);
    expect(tables.a2i_role_interests).toHaveLength(0);
  });

  it('records the failure when Tom’s email cannot be sent, but the athlete still sees success', async () => {
    emailOk = false;
    const res = await match.POST(req('POST', matchUrl(TOKEN, '4467043'), {}), mctx(TOKEN, '4467043'));
    expect(res.status).toBe(200);
    expect(tables.a2i_role_interests[0]).toMatchObject({ notify_error: 'Resend down' });
  });

  it('rejects an overlong note', async () => {
    const res = await match.POST(req('POST', matchUrl(TOKEN, '4467043'), { note: 'x'.repeat(1001) }), mctx(TOKEN, '4467043'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/r/roles/[token]/unsubscribe', () => {
  it('opts the address out, idempotently', async () => {
    const url = `https://portal.example.com/api/r/roles/${TOKEN}/unsubscribe`;
    expect(await (await unsub.POST(req('POST', url), uctx(TOKEN))).json()).toEqual({ ok: true, already: false });
    expect(await (await unsub.POST(req('POST', url), uctx(TOKEN))).json()).toEqual({ ok: true, already: true });
    expect(tables.a2i_role_alert_optouts).toMatchObject([{ email_lower: 'sam@example.com', athlete_id: 'a1', source: 'link' }]);
  });

  it('works on an expired link — stopping must always be possible', async () => {
    const res = await unsub.POST(req('POST', `https://portal.example.com/api/r/roles/${EXPIRED}/unsubscribe`), uctx(EXPIRED));
    expect(res.status).toBe(200);
    expect(tables.a2i_role_alert_optouts).toHaveLength(1);
  });

  it('accepts the RFC 8058 one-click form body', async () => {
    const r = new NextRequest(`https://portal.example.com/api/r/roles/${TOKEN}/unsubscribe`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click',
    });
    expect((await unsub.POST(r, uctx(TOKEN))).status).toBe(200);
  });

  it('refuses an unknown link', async () => {
    const t = '33333333-2222-4333-8444-555555555555';
    expect((await unsub.POST(req('POST', `https://portal.example.com/api/r/roles/${t}/unsubscribe`), uctx(t))).status).toBe(404);
  });
});
