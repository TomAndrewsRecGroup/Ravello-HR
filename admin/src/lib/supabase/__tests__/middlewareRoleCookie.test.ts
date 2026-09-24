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
