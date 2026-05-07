import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  PORTAL_SESSION_COOKIE, signPortalSession, verifyPortalSession,
} from '@/lib/auth/portalSession';

const PUBLIC_ROUTES = [
  /^\/auth\//,
  /^\/api\/learning\/webhook$/,
  /^\/api\/partner\//,
];

// 15-minute TTL: feature-flag changes made in the admin portal won't
// be visible to an active portal session until this cookie expires
// or the user triggers a fresh auth (sign-out / sign-in).
const SESSION_TTL = 60 * 15;

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
