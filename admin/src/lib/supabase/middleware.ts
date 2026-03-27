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
  const isPublic = pathname.startsWith('/auth');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    // Role cached in cookie — avoids a DB round trip on every navigation
    const cachedRole = request.cookies.get('tpo_admin_role')?.value;

    if (cachedRole) {
      if (!['ravello_admin', 'ravello_recruiter'].includes(cachedRole)) {
        const url = request.nextUrl.clone();
        url.pathname = '/auth/unauthorised';
        return NextResponse.redirect(url);
      }
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const role = (profile as any)?.role ?? '';
      if (!['ravello_admin', 'ravello_recruiter'].includes(role)) {
        const url = request.nextUrl.clone();
        url.pathname = '/auth/unauthorised';
        return NextResponse.redirect(url);
      }

      supabaseResponse.cookies.set('tpo_admin_role', role, {
        httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 8, path: '/',
      });
    }
  }

  if (user && isPublic && !pathname.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
