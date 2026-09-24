import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Drives the REAL updateSession() against fabricated requests and
// asserts the response shape (redirect or pass-through) — the only
// thing that was ever wrong in the two defects this pins:
//
//  1. The employee leave link (/leave/<token>) redirected to login. The
//     employee has no portal account by design, so the feature was
//     unreachable for every person it exists for. Its API, which the
//     page's own server-side preflight calls with no cookie, too.
//  2. Module flags were enforced only in the sidebar. A client with a
//     module switched off could still open it by typing the address.

process.env.NEXT_PUBLIC_SUPABASE_URL      ??= 'https://stub.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'stub-anon';
process.env.PORTAL_SESSION_SECRET = 'test-secret-for-middleware';

let currentUser: { id: string; email: string } | null = null;
let companyFlags: Record<string, boolean> = {};
let companyReads = 0;

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => currentUser
        ? { data: { user: currentUser }, error: null }
        : { data: { user: null }, error: { message: 'Auth session missing!' } },
    },
    rpc: async (fn: string) => {
      if (fn === 'get_my_role')    return { data: 'client_admin', error: null };
      if (fn === 'get_my_profile') return { data: [{ company_id: 'co-1', onboarding_completed: true }], error: null };
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (table === 'companies') companyReads++;
            return { data: { feature_flags: companyFlags }, error: null };
          },
        }),
      }),
    }),
  }),
}));

const { updateSession } = await import('../middleware');
const { signPortalSession, PORTAL_SESSION_COOKIE } = await import('../../auth/portalSession');

const TOKEN = 'a'.repeat(32);

function req(pathname: string, cookie?: string): NextRequest {
  return new NextRequest(`https://portal.thepeoplesystem.co.uk${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

async function signedCookie(): Promise<string> {
  const signed = await signPortalSession({
    userId: 'u-1', role: 'client_admin', companyId: 'co-1', isTpsStaff: false,
    featureFlags: { lead: true }, // deliberately stale — the gate must read fresh
  });
  return `${PORTAL_SESSION_COOKIE}=${signed}`;
}

function location(res: Response): string | null {
  return res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
}

beforeEach(() => {
  currentUser = null;
  companyFlags = {};
  companyReads = 0;
});

describe('employee leave link is reachable without a login', () => {
  it.each([`/leave/${TOKEN}`, `/api/leave/${TOKEN}`])('%s is not redirected', async (p) => {
    const res = await updateSession(req(p));
    expect(location(res)).toBeNull();
  });

  it('a normal portal page still redirects a signed-out visitor', async () => {
    const res = await updateSession(req('/dashboard'));
    expect(location(res)).toContain('/auth/login');
  });

  it('the exemption is scoped to the leave path, not a lookalike', async () => {
    const res = await updateSession(req('/leaves-admin'));
    expect(location(res)).toContain('/auth/login');
  });
});

describe('module flags are enforced on the page, not just the menu', () => {
  it('cached session: a switched-off sub-module redirects to the dashboard', async () => {
    companyFlags = { lead: true, org_chart: false };
    const res = await updateSession(req('/lead/org-chart', await signedCookie()));
    expect(location(res)).toMatch(/\/dashboard$/);
  });

  it('cached session: reads flags FRESH, not from the 15-minute cookie', async () => {
    companyFlags = { lead: false }; // cookie says lead: true
    const res = await updateSession(req('/lead/documents', await signedCookie()));
    expect(location(res)).toMatch(/\/dashboard$/);
    expect(companyReads).toBe(1);
  });

  it('cached session: an enabled module passes through', async () => {
    companyFlags = { lead: true, org_chart: true };
    const res = await updateSession(req('/lead/org-chart', await signedCookie()));
    expect(location(res)).toBeNull();
  });

  it('cached session: an ungated page costs no flag read', async () => {
    const res = await updateSession(req('/settings', await signedCookie()));
    expect(location(res)).toBeNull();
    expect(companyReads).toBe(0);
  });

  it('fresh sign-in path: a switched-off module redirects too', async () => {
    currentUser = { id: 'u-1', email: 'client@example.com' };
    companyFlags = { calendar: false };
    const res = await updateSession(req('/calendar'));
    expect(location(res)).toMatch(/\/dashboard$/);
  });

  it('fresh sign-in path: the signed session cookie survives the redirect', async () => {
    currentUser = { id: 'u-1', email: 'client@example.com' };
    companyFlags = { support: false };
    const res = await updateSession(req('/support'));
    expect(location(res)).toMatch(/\/dashboard$/);
    expect(res.headers.get('set-cookie') ?? '').toContain(PORTAL_SESSION_COOKIE);
  });
});
