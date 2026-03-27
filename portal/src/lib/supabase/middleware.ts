import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const UNLOCK_COOKIE = 'tpo_unlocked';

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Coming soon gate — checked before everything else ──────────────────────
  const isGateRoute = pathname === '/coming-soon' || pathname.startsWith('/api/unlock');

  if (!isGateRoute && !request.cookies.get(UNLOCK_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/coming-soon';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // ── Dev bypass — skip Supabase auth when gate creds are set ───────────────
  if (process.env.DEV_ADMIN_EMAIL && process.env.DEV_ADMIN_PASSWORD) {
    return NextResponse.next({ request });
  }

  // ── Supabase session refresh ───────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    {
      cookies: {
        getAll()        { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthRoute    = pathname.startsWith('/auth');
  const isPublicRoute  = pathname === '/auth/login' || pathname === '/auth/callback' || pathname === '/auth/reset-password';

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute && !pathname.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
