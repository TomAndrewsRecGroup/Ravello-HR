import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
  /^\/auth\//,
  /^\/api\/learning\/webhook$/,
  /^\/api\/partner\//,
];

const SESSION_COOKIE = 'tps_portal_session';
const SESSION_TTL = 60 * 15; // 15 minutes

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

  // Check for cached session cookie — if valid, skip auth
  const cachedSession = request.cookies.get(SESSION_COOKIE)?.value;
  if (cachedSession && !isPublicRoute) {
    try {
      const parsed = JSON.parse(cachedSession);
      if (parsed.userId && parsed.companyId) {
        return supabaseResponse;
      }
    } catch {}
    // Cookie exists but invalid/missing companyId — fall through to re-validate
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

  // Stamp session cookie with fresh data from DB
  if (user && !isPublicRoute) {
    const { data: rpcRole } = await supabase.rpc('get_my_role');
    const role = typeof rpcRole === 'string' ? rpcRole : '';
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, ui_preferences, onboarding_completed')
      .eq('id', user.id)
      .single();

    const sessionData = {
      userId: user.id,
      email: user.email,
      role,
      companyId: (profile as any)?.company_id ?? '',
      isTpsStaff: role === 'tps_admin' || role === 'tps_client',
      uiPreferences: (profile as any)?.ui_preferences ?? {},
      onboardingCompleted: (profile as any)?.onboarding_completed ?? true,
    };

    supabaseResponse.cookies.set(SESSION_COOKIE, JSON.stringify(sessionData), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL,
      path: '/',
    });
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
