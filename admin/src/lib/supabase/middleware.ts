import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ALLOWED_ROLES = ['tps_admin', 'tps_client'];
const ROLE_CACHE_SECONDS = 60 * 15; // 15 minutes — short enough to revoke access promptly

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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const isPublic = pathname.startsWith('/auth');

  // Log auth infrastructure errors (not routine "no session" cases)
  if (authError && authError.message !== 'Auth session missing!') {
    console.error('[auth] getUser failed:', authError.message);
  }

  // Unauthenticated → login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('reason', 'no-session');
    return NextResponse.redirect(url);
  }

  // Authenticated on protected route → verify role
  if (user && !isPublic) {
    const cachedRole = request.cookies.get('tpo_admin_role')?.value;

    if (cachedRole && typeof cachedRole === 'string' && ALLOWED_ROLES.includes(cachedRole)) {
      // Valid cached role — proceed
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const role = (profile as any)?.role;
      if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role)) {
        // Sign out + clear role cookie to prevent redirect loop
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = '/auth/login';
        url.searchParams.set('reason', 'unauthorised');
        const response = NextResponse.redirect(url);
        response.cookies.set('tpo_admin_role', '', {
          httpOnly: true, sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 0, path: '/',
        });
        // Clear supabase auth cookies to ensure clean state
        request.cookies.getAll().forEach(cookie => {
          if (cookie.name.startsWith('sb-')) {
            response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' });
          }
        });
        return response;
      }

      supabaseResponse.cookies.set('tpo_admin_role', role, {
        httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ROLE_CACHE_SECONDS, path: '/',
      });
    }
  }

  // Authenticated on auth pages → redirect to dashboard
  // Skip if reason param is present (user was just rejected — avoid redirect loop)
  if (user && isPublic && !pathname.startsWith('/auth/callback') && !pathname.startsWith('/auth/signout')) {
    const reason = request.nextUrl.searchParams.get('reason');
    if (!reason) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
