import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  PORTAL_SESSION_COOKIE, PORTAL_SESSION_TTL_SECONDS, signPortalSession, verifyPortalSession,
} from '@/lib/auth/portalSession';
import { disabledFlagFor, requiredFlagsFor } from '@/lib/moduleAccess';

const PUBLIC_ROUTES = [
  /^\/auth\//,
  /^\/api\/auth\//,                  // /api/auth/set-password — first-time password creation, caller is not yet signed in
  /^\/api\/learning\/webhook$/,
  /^\/api\/partner\//,
  /^\/r\//,                          // public Athletes/Partners referral pages — open, no login
  /^\/api\/r\//,                     // their submission endpoints — open, anonymous athletes/partners
  // Employee leave requests via the personal link an admin shares. The
  // employee has no portal login by design (no seat consumed), so this
  // page redirecting to /auth/login made the whole feature unreachable
  // for the only people it exists for. Both routes authorise by the
  // 128-bit token in the URL, through the service-role client, with
  // per-IP and per-token rate limits (api/leave/[token]/route.ts). The
  // page's server-side preflight also calls the API with no cookie, so
  // the API must be public too.
  /^\/leave\//,
  /^\/api\/leave\//,
  // Employee policy acknowledgement via the personal link the consumer
  // emails (103). Same shape and the same reason as the leave link.
  /^\/policy\//,
  /^\/api\/policy\//,
];

// Carry any cookies Supabase refreshed (and our signed session cookie)
// onto a redirect, so bouncing a locked page never logs anyone out.
function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  const res = NextResponse.redirect(url);
  for (const c of from.cookies.getAll()) res.cookies.set(c);
  return res;
}

// 15-minute TTL: feature-flag changes made in the admin portal won't
// be visible to an active portal session until this cookie expires
// or the user triggers a fresh auth (sign-out / sign-in). The same
// window is enforced server-side by verifyPortalSession().
const SESSION_TTL = PORTAL_SESSION_TTL_SECONDS;

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  const isPublicRoute = PUBLIC_ROUTES.some(pattern => pattern.test(pathname));

  // Cookie-fast-path. ONLY trusted when the HMAC signature verifies
  // against PORTAL_SESSION_SECRET. A tampered (or unsigned-from-an-
  // older-deploy) cookie returns null, and the request falls through
  // to a real Supabase auth.getUser() + a freshly-signed cookie. If
  // the env secret is missing, verifyPortalSession() always returns
  // null — so we never silently downgrade to the old plaintext format.
  const cachedSessionRaw = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  const cached = await verifyPortalSession(cachedSessionRaw);
  if (cached && !isPublicRoute) {
    if (cached.userId && (cached.companyId || cached.isTpsStaff)) {
      // Module gate. The cookie's flags can be 15 minutes stale, and an
      // admin switching a module off must take effect now (the layout
      // reads flags fresh for the same reason), so read them fresh —
      // but only for a path a module owns; ungated pages stay free.
      if (cached.companyId && requiredFlagsFor(pathname).length > 0) {
        const { data, error } = await supabase
          .from('companies').select('feature_flags').eq('id', cached.companyId).single();
        if (error) {
          // Fail OPEN: this gate is commercial, not a data boundary —
          // RLS still scopes every row to the caller's company — and a
          // transient DB error must not lock a paying client out.
          console.error('[auth] module-gate flag read failed:', error.message);
        } else if (disabledFlagFor(pathname, (data as any)?.feature_flags)) {
          return redirectKeepingCookies(request, supabaseResponse, '/dashboard');
        }
      }
      return supabaseResponse;
    }
  }

  // Validate with Supabase (first load, or every 15 min when cookie expires)
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError && authError.message !== 'Auth session missing!') {
    console.error('[auth] getUser failed:', authError.message);
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // Stamp signed session cookie with fresh data from DB.
  let lastFlags: Record<string, boolean> = {};
  if (user && !isPublicRoute) {
    const [{ data: rpcRole, error: roleErr }, { data: profileRows, error: profErr }] = await Promise.all([
      supabase.rpc('get_my_role'),
      supabase.rpc('get_my_profile'),
    ]);

    if (roleErr) console.error('[auth] get_my_role failed:', roleErr.message);
    if (profErr) console.error('[auth] get_my_profile failed:', profErr.message);

    const role = typeof rpcRole === 'string' ? rpcRole : '';
    const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;
    const companyId = profile?.company_id ?? '';


    let featureFlags: Record<string, boolean> = {};
    if (companyId && role !== 'tps_admin') {
      const [companyRes] = await Promise.all([
        supabase.from('companies').select('feature_flags').eq('id', companyId).single(),
        supabase.rpc('record_portal_login', { p_company_id: companyId }),
      ]);
      featureFlags = (companyRes.data as any)?.feature_flags ?? {};
    } else if (companyId) {
      const { data: company } = await supabase
        .from('companies').select('feature_flags').eq('id', companyId).single();
      featureFlags = (company as any)?.feature_flags ?? {};
    }

    lastFlags = featureFlags;

    const sessionData = {
      userId: user.id,
      email: user.email ?? null,
      role,
      companyId,
      isTpsStaff: role === 'tps_admin',
      uiPreferences: (profile as any)?.ui_preferences ?? {},
      onboardingCompleted: (profile as any)?.onboarding_completed ?? true,
      featureFlags,
      fullName: (profile as any)?.full_name ?? null,
    };

    const signed = await signPortalSession(sessionData);
    if (signed) {
      supabaseResponse.cookies.set(PORTAL_SESSION_COOKIE, signed, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_TTL,
        path: '/',
      });
    } else {
      // No PORTAL_SESSION_SECRET — clear any prior cookie so the next
      // request also goes through real auth instead of trusting
      // whatever stale unsigned value the browser still holds.
      console.error('[auth] PORTAL_SESSION_SECRET missing — refusing to stamp unsigned session cookie');
      supabaseResponse.cookies.set(PORTAL_SESSION_COOKIE, '', { maxAge: 0, path: '/' });
    }
  }

  // Module gate on the slow path — featureFlags was just read fresh above.
  // TPS staff with no company of their own have no flags to apply.
  if (user && !isPublicRoute && disabledFlagFor(pathname, lastFlags)) {
    return redirectKeepingCookies(request, supabaseResponse, '/dashboard');
  }

  // Authenticated on auth pages → redirect to dashboard
  if (user && pathname.startsWith('/auth') && !pathname.startsWith('/auth/callback') && !pathname.startsWith('/auth/signout')) {
    const reason = request.nextUrl.searchParams.get('reason');
    if (!reason) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
