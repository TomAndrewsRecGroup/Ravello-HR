import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_ROLE_COOKIE,
  ROLE_CACHE_SECONDS,
  signAdminRole,
  verifyAdminRole,
} from '@/lib/auth/adminRoleCookie';
import { homeFor, isAdminAppRole, roleMayReach } from '@/lib/auth/rolePaths';

// Routes with no browser session to check — server-to-server callers
// that verify themselves (CRON_SECRET, stripe-signature), not a
// Supabase cookie. Mirrors the PUBLIC_ROUTES allowlist portal's own
// middleware already uses for its equivalent case (/api/r/, /api/partner/).
//
// Found 2026-09-04: every cron in vercel.json's crons[] — referral-scan,
// ingest-feeds, prune-latest-updates, prune-email-attachments — and the
// Stripe webhook were all being 307-redirected to /auth/login before
// ever reaching their own auth check, because this file's ONLY
// exemption was pathname.startsWith('/auth'). A cron or webhook caller
// carries no session cookie, so `!user` was always true, and the
// redirect fired unconditionally. Vercel's cron invoker and Stripe's
// webhook sender do not follow redirects — they record the 307 and
// stop — so the route body, including its OWN auth check, never ran.
// referral_scan_runs never recorded a real scheduled run because
// nothing ever reached recordRun(); Stripe's invoice.paid /
// subscription.* events were never processed for the same reason.
const PUBLIC_ROUTES = [
  /^\/auth/,
  /^\/api\/cron\//,
  /^\/api\/stripe\/webhook$/,
];

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(pattern => pattern.test(pathname));

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          request.cookies.set(name, value);
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, value, options);
        },
        remove(name: string, options: Record<string, unknown>) {
          request.cookies.set(name, '');
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(name, '', options);
        },
      },
    },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Log auth infrastructure errors (not routine "no session" cases)
  if (authError && authError.message !== 'Auth session missing!') {
    console.error('[auth] getUser failed:', authError.message);
  }

  // Unauthenticated → login (skip for public auth pages)
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('reason', 'no-session');
    const response = NextResponse.redirect(url);
    // A role cookie outliving its session (a shared browser after the
    // session expired) should not sit there for the next person.
    if (request.cookies.get(ADMIN_ROLE_COOKIE)) {
      response.cookies.set(ADMIN_ROLE_COOKIE, '', {
        httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0, path: '/',
      });
    }
    return response;
  }

  // Helper: sign out and redirect to login with a reason
  function signOutAndRedirect(reason: string, opts: { keepSession?: boolean } = {}) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('reason', reason);
    const response = NextResponse.redirect(url);
    if (opts.keepSession) return response;
    // Clear role cookie
    response.cookies.set(ADMIN_ROLE_COOKIE, '', {
      httpOnly: true, sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0, path: '/',
    });
    // Clear supabase auth cookies to break any redirect loop
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.startsWith('sb-')) {
        response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' });
      }
    });
    return response;
  }

  // Authenticated on protected route → verify role.
  //
  // The cached role is trusted ONLY when its signature verifies and it
  // was minted for this exact user (see lib/auth/adminRoleCookie.ts).
  // Until 2026-09-24 a bare `tpo_admin_role=tps_admin` cookie, which
  // any signed-in user could set by hand, skipped this check entirely.
  if (user && !isPublic) {
    const cached = await verifyAdminRole(request.cookies.get(ADMIN_ROLE_COOKIE)?.value, user.id);
    let role: string | null = null;

    if (cached && isAdminAppRole(cached.role)) {
      // Valid signed role for this user: no RPC needed. Where that role
      // may go is still checked below, on this path too.
      role = cached.role;
    } else {
      // Use SECURITY DEFINER function to bypass RLS circular dependency
      // (profiles RLS calls is_tps_staff() which queries profiles again)
      const { data: rpcRole, error: roleError } = await supabase.rpc('get_my_role');

      if (roleError) {
        console.error('[auth] get_my_role() failed:', roleError.message, '| user:', user.id);
      }

      // A FAILED check is not a "no". Signing out on a transient RPC error
      // ended a staff member's session — every session, since signOut()
      // defaults to global scope — and with ADMIN_SESSION_SECRET unset this
      // check runs on every request. Send them to sign in again instead,
      // session intact.
      if (roleError) {
        return signOutAndRedirect('role-check-failed', { keepSession: true });
      }

      role = typeof rpcRole === 'string' ? rpcRole : null;
      if (!role || !isAdminAppRole(role)) {
        // Sign out HERE only: both apps share Supabase auth, so a global
        // sign-out would also end a client's portal sessions everywhere
        // just for opening the admin URL.
        await supabase.auth.signOut({ scope: 'local' });
        return signOutAndRedirect('unauthorised');
      }

      // No secret → no cookie: every request re-checks the role. Slower,
      // never open.
      const signed = await signAdminRole({ userId: user.id, role });
      if (signed) {
        supabaseResponse.cookies.set(ADMIN_ROLE_COOKIE, signed, {
          httpOnly: true, sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: ROLE_CACHE_SECONDS, path: '/',
        });
      }
    }

    // A provider may reach only its workspace (lib/auth/rolePaths.ts).
    // Pages bounce to the role's home; an API answers 403, since a
    // redirect to an HTML page is no answer to a fetch().
    if (!roleMayReach(role, pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = homeFor(role);
      url.search = '';
      const res = NextResponse.redirect(url);
      for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
      return res;
    }
  }

  // Authenticated on auth pages → redirect to dashboard ONLY if role is already confirmed
  if (user && isPublic && !pathname.startsWith('/auth/callback') && !pathname.startsWith('/auth/signout')) {
    const cached = await verifyAdminRole(request.cookies.get(ADMIN_ROLE_COOKIE)?.value, user.id);
    if (cached && isAdminAppRole(cached.role)) {
      // Role confirmed: safe to redirect to that role's home. Build a clean
      // URL — DON'T clone the auth page's URL, otherwise leftover
      // query params like ?reason=unauthorised end up pinned to
      // /dashboard and the user thinks something's still wrong.
      const url = request.nextUrl.clone();
      url.pathname = homeFor(cached.role);
      url.search = '';
      return NextResponse.redirect(url);
    }
    // No confirmed role: don't redirect, let them stay on the auth page
    // This prevents the loop: dashboard rejects → login → dashboard rejects → ...
  }

  return supabaseResponse;
}
