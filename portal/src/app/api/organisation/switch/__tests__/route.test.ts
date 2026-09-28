import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The switch route relays set_active_organisation() — the database is
// the boundary — and must (a) refuse without a session, (b) validate the
// body, (c) give one answer for "not yours" and "does not exist", and
// (d) ALWAYS drop the cached session cookie on success, because that
// cookie names the previous organisation for up to 15 minutes.

let user: { id: string } | null;
let rpcResult: { data: unknown; error: { code?: string; message: string } | null };
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (fn: string, args: unknown) => { rpcCalls.push({ fn, args }); return rpcResult; },
  }),
}));
vi.mock('@/lib/rateLimit', () => ({
  limiters: { write: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse: () => new Response('slow', { status: 429 }),
}));

const { POST } = await import('../route');
const ORG = '11111111-2222-4333-8444-555555555555';
const req = (body: unknown) => new NextRequest('https://portal.example.com/api/organisation/switch', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  user = { id: 'u1' };
  rpcResult = { data: ORG, error: null };
  rpcCalls.length = 0;
});

describe('POST /api/organisation/switch', () => {
  it('refuses without a session', async () => {
    user = null;
    const res = await POST(req({ organisationId: ORG }));
    expect(res.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it('refuses a malformed organisation id before touching the database', async () => {
    const res = await POST(req({ organisationId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('asks the database, and drops the cached session cookie on success', async () => {
    const res = await POST(req({ organisationId: ORG }));
    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([{ fn: 'set_active_organisation', args: { p_org: ORG } }]);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/tps_portal_session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  it('null returns the user to their home organisation', async () => {
    rpcResult = { data: 'home', error: null };
    const res = await POST(req({ organisationId: null }));
    expect(res.status).toBe(200);
    expect(rpcCalls[0].args).toEqual({ p_org: null });
  });

  it('gives one 403 for an organisation that is not yours, and keeps the cookie', async () => {
    rpcResult = { data: null, error: { code: '42501', message: 'No access to that organisation' } };
    const res = await POST(req({ organisationId: ORG }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'You do not have access to that organisation' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('reports a database failure as a 500, not as access denied', async () => {
    rpcResult = { data: null, error: { code: 'XX000', message: 'boom' } };
    const res = await POST(req({ organisationId: ORG }));
    expect(res.status).toBe(500);
  });
});
