// A signed-in CLIENT user who hand-sets the old-style role cookie must
// still be refused. Until 2026-09-24 the middleware skipped the role
// check whenever `tpo_admin_role` read "tps_admin", and the admin and
// portal apps share Supabase auth, so every client user could do this.
//
// Drives the real updateSession() and asserts the response shape, the
// same discipline as middleware.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CLIENT_ID = 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';
const STAFF_ID  = '3f6b51bb-d9ac-43ef-9252-ff4274143897';

let currentUserId = CLIENT_ID;
let rpcRole = 'client_admin';
let rpcError: { message: string } | null = null;
let rpcCalls = 0;
const signOuts: unknown[] = [];

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }),
      signOut: async (opts?: unknown) => { signOuts.push(opts ?? 'global-default'); return { error: null }; },
    },
    rpc: async () => { rpcCalls++; return rpcError ? { data: null, error: rpcError } : { data: rpcRole, error: null }; },
  }),
}));

const { updateSession } = await import('../middleware');
const { signAdminRole } = await import('../../auth/adminRoleCookie');

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://admin.thepeoplesystem.co.uk${path}`, {
    headers: cookie ? { cookie: `tpo_admin_role=${cookie}` } : undefined,
  });
}

function redirectsToLogin(res: Response): boolean {
  const loc = res.headers.get('location') ?? '';
  return res.status >= 300 && res.status < 400 && loc.includes('/auth/login');
}

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = 'test-secret-that-is-long-enough';
  currentUserId = CLIENT_ID;
  rpcRole = 'client_admin';
  rpcError = null;
  rpcCalls = 0;
  signOuts.length = 0;
});
afterEach(() => { delete process.env.ADMIN_SESSION_SECRET; });

describe('the cached role cookie cannot be forged', () => {
  it('a client with a hand-set tpo_admin_role=tps_admin is refused', async () => {
    const res = await updateSession(request('/dashboard', 'tps_admin'));
    expect(redirectsToLogin(res)).toBe(true);
    expect(rpcCalls).toBe(1);   // it fell through to the real check
  });

  it('a client presenting a genuine STAFF cookie is refused', async () => {
    const stolen = await signAdminRole({ userId: STAFF_ID, role: 'tps_admin' });
    const res = await updateSession(request('/users', stolen!));
    expect(redirectsToLogin(res)).toBe(true);
  });

  it('staff with no cookie pass, and get a signed one back', async () => {
    currentUserId = STAFF_ID;
    rpcRole = 'tps_admin';
    const res = await updateSession(request('/dashboard'));
    expect(redirectsToLogin(res)).toBe(false);
    const set = res.cookies.get('tpo_admin_role')?.value ?? '';
    expect(set).not.toBe('tps_admin');
    expect(set).toMatch(/^[\w-]+\.[\w-]+$/);
  });

  it('staff with a valid signed cookie skip the RPC', async () => {
    currentUserId = STAFF_ID;
    rpcRole = 'tps_admin';
    const signed = await signAdminRole({ userId: STAFF_ID, role: 'tps_admin' });
    const res = await updateSession(request('/dashboard', signed!));
    expect(redirectsToLogin(res)).toBe(false);
    expect(rpcCalls).toBe(0);
  });

  it('a forged cookie does not bounce a signed-in client off /auth/login to the dashboard', async () => {
    const res = await updateSession(request('/auth/login', 'tps_admin'));
    expect(res.headers.get('location') ?? '').not.toContain('/dashboard');
  });
});

describe('what a refused or failed role check does to the session', () => {
  it('a FAILED check does not sign a staff member out', async () => {
    currentUserId = STAFF_ID;
    rpcError = { message: 'connection reset' };
    const res = await updateSession(request('/dashboard'));
    expect(redirectsToLogin(res)).toBe(true);
    expect(res.headers.get('location')).toContain('reason=role-check-failed');
    expect(signOuts).toEqual([]);
    // and the Supabase session cookies are left alone
    expect(res.headers.getSetCookie?.() ?? []).not.toContainEqual(expect.stringMatching(/^sb-/));
  });

  it('a non-staff user is signed out of THIS app only, not their portal sessions everywhere', async () => {
    const res = await updateSession(request('/dashboard'));
    expect(redirectsToLogin(res)).toBe(true);
    expect(signOuts).toEqual([{ scope: 'local' }]);
  });
});

// An external H&S provider (hs_provider, migration 094) signs in to this
// app but may reach ONLY its workspace. Everything else here is staff
// territory and much of it reads with the service role, so the path
// check must hold on the cached-cookie fast path as well as the RPC one.
describe('an H&S provider is confined to /hs', () => {
  const PROVIDER_ID = '0f0a3c55-5d1e-4a57-9d6b-1c0f2b7f9a11';
  beforeEach(() => { currentUserId = PROVIDER_ID; rpcRole = 'hs_provider'; });

  const location = (res: Response) => new URL(res.headers.get('location') ?? 'http://x/').pathname;

  it.each(['/hs', '/hs/c/23526e83-afc1-4c6e-85d6-ab7d42dc0709/register', '/api/hs/anything'])(
    'may reach %s', async (path) => {
      const res = await updateSession(request(path));
      expect(res.status).toBe(200);
    });

  it.each(['/dashboard', '/clients/abc', '/', '/hsx', '/hs-admin', '/health-safety/providers'])(
    'is sent home from %s, not to a staff page', async (path) => {
      const res = await updateSession(request(path));
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(location(res)).toBe('/hs');
    });

  it.each(['/api/files/sign', '/api/admin/clients/abc/raise-invoice', '/api/invite', '/api/hsx/y'])(
    'gets a 403 from %s', async (path) => {
      const res = await updateSession(request(path));
      expect(res.status).toBe(403);
    });

  it('the fast path checks the path too: a valid provider cookie still cannot open /dashboard', async () => {
    const signed = await signAdminRole({ userId: PROVIDER_ID, role: 'hs_provider' });
    const res = await updateSession(request('/dashboard', signed!));
    expect(rpcCalls).toBe(0);
    expect(location(res)).toBe('/hs');
  });

  it('is not signed out: a provider is a legitimate user of this app', async () => {
    await updateSession(request('/dashboard'));
    expect(signOuts).toEqual([]);
  });

  it('lands on /hs, not /dashboard, from the sign-in page', async () => {
    const signed = await signAdminRole({ userId: PROVIDER_ID, role: 'hs_provider' });
    const res = await updateSession(request('/auth/login', signed!));
    expect(location(res)).toBe('/hs');
  });

  it('staff still reach /hs as well as everything else', async () => {
    currentUserId = STAFF_ID; rpcRole = 'tps_admin';
    for (const path of ['/hs', '/dashboard', '/api/files/sign']) {
      const res = await updateSession(request(path));
      expect(res.status, path).toBe(200);
    }
  });
});
