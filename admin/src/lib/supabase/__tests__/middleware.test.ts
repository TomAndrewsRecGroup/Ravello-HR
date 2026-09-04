import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Found 2026-09-04: every cron (referral-scan, ingest-feeds,
// prune-latest-updates, prune-email-attachments) and the Stripe
// webhook were being 307-redirected to /auth/login before their own
// body ever ran, because this middleware's only public-route check was
// pathname.startsWith('/auth'). A server-to-server caller carries no
// session cookie, so `!user` was always true here, and Vercel's cron
// invoker / Stripe's webhook sender do not follow redirects — they
// record the 307 and stop. referral_scan_runs held real evidence of
// this: zero rows in the cron route's own vocabulary (ok/degraded/
// no_roles/error), ever — only three 'manual' rows from a hand-run
// script, despite an hourly schedule that had been "running" for days.
//
// A source-text check ("does the file mention CRON_SECRET") would have
// stayed green throughout — the route's own auth was fine, and was
// simply never reached. This drives the real middleware function
// against fabricated requests and asserts the RESPONSE SHAPE: did it
// redirect, or pass through. That is the only thing that was ever wrong.

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      // The exact shape an unauthenticated / cookie-less caller gets
      // back — a cron or webhook request carries no Supabase cookie.
      getUser: async () => ({
        data: { user: null },
        error: { message: 'Auth session missing!' },
      }),
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const { updateSession } = await import('../middleware');

function requestFor(pathname: string): NextRequest {
  return new NextRequest(`https://admin.thepeoplesystem.co.uk${pathname}`, {
    headers: pathname.startsWith('/api/cron')
      ? { authorization: 'Bearer whatever-cron-sends' }
      : undefined,
  });
}

function isRedirectToLogin(res: Response): boolean {
  const location = res.headers.get('location');
  return res.status >= 300 && res.status < 400 && !!location && location.includes('/auth/login');
}

describe('server-to-server routes are never redirected to login', () => {
  it.each([
    '/api/cron/referral-scan',
    '/api/cron/ingest-feeds',
    '/api/cron/prune-latest-updates',
    '/api/cron/prune-email-attachments',
    '/api/stripe/webhook',
  ])('%s passes through with no session cookie', async (path) => {
    const res = await updateSession(requestFor(path));
    expect(isRedirectToLogin(res)).toBe(false);
  });
});

describe('the exemption is scoped, not a blanket /api bypass', () => {
  it.each([
    '/dashboard',
    '/api/admin/referrals/config',
    '/api/admin/clients/abc/raise-invoice',
    '/api/invite',
  ])('%s still redirects to login with no session cookie', async (path) => {
    const res = await updateSession(requestFor(path));
    expect(isRedirectToLogin(res)).toBe(true);
  });
});

describe('an unrelated path under /api/cron is not swept in by accident', () => {
  it('only exact /api/cron/ prefixes are exempt — a lookalike path still redirects', async () => {
    // Guards against a sloppier regex (e.g. /api\/cron/ without the
    // anchor) that would also exempt something like
    // /api/crontab-export by accident.
    const res = await updateSession(requestFor('/api/crontab-export'));
    expect(isRedirectToLogin(res)).toBe(true);
  });
});
