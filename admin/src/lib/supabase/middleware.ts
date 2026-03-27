import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  // ── Dev bypass ─────────────────────────────────────────────────────────────
  if (process.env.DEV_ADMIN_EMAIL && process.env.DEV_ADMIN_PASSWORD) {
    return NextResponse.next({ request });
  }

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
  const pathname = request.nextUrl.pathname;
  const isPublic = pathname.startsWith('/auth');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    // Check role from short-lived cookie (set at login) — avoids a DB round
    // trip on every navigation. Falls back to a DB query if cookie is absent.
    const cachedRole = request.cookies.get('tpo_admin_role')?.value;

    if (cachedRole) {
      const allowed = ['ravello_admin', 'ravello_recruiter'];
      if (!allowed.includes(cachedRole)) {
        const url = request.nextUrl.clone();
        url.pathname = '/auth/unauthorised';
        return NextResponse.redirect(url);
      }
    } else {
      // First request after login — fetch role and cache it
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const role = (profile as any)?.role ?? '';
      const allowed = ['ravello_admin', 'ravello_recruiter'];

      if (!allowed.includes(role)) {
        const url = request.nextUrl.clone();
        url.pathname = '/auth/unauthorised';
        return NextResponse.redirect(url);
      }

      // Cache for 8 hours — cleared automatically on signout via /auth/signout
      supabaseResponse.cookies.set('tpo_admin_role', role, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 8,
        path: '/',
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
