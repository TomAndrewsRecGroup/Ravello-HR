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

  // Unauthenticated → login (skip for public auth pages)
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('reason', 'no-session');
    return NextResponse.redirect(url);
  }

  // Helper: sign out and redirect to login with a reason
  function signOutAndRedirect(reason: string) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('reason', reason);
    const response = NextResponse.redirect(url);
    // Clear role cookie
    response.cookies.set('tpo_admin_role', '', {
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

  // Authenticated on protected route → verify role
  if (user && !isPublic) {
    const cachedRole = request.cookies.get('tpo_admin_role')?.value;

    if (cachedRole && typeof cachedRole === 'string' && ALLOWED_ROLES.includes(cachedRole)) {
      // Valid cached role — proceed
    } else {
      // Use SECURITY DEFINER function to bypass RLS circular dependency
      // (profiles RLS calls is_tps_staff() which queries profiles again)
      const { data: rpcRole, error: roleError } = await supabase.rpc('get_my_role');

      if (roleError) {
        console.error('[auth] get_my_role() failed:', roleError.message, '| user:', user.id);
      }

      const role = typeof rpcRole === 'string' ? rpcRole : null;
      if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role)) {
        // Sign out to prevent redirect loop, then send to login
        await supabase.auth.signOut();
        return signOutAndRedirect('unauthorised');
      }

      supabaseResponse.cookies.set('tpo_admin_role', role, {
        httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ROLE_CACHE_SECONDS, path: '/',
      });
    }
  }

  // Authenticated on auth pages → redirect to dashboard ONLY if role is already confirmed
  if (user && isPublic && !pathname.startsWith('/auth/callback') && !pathname.startsWith('/auth/signout')) {
    const cachedRole = request.cookies.get('tpo_admin_role')?.value;
    if (cachedRole && ALLOWED_ROLES.includes(cachedRole)) {
      // Role confirmed — safe to redirect to dashboard
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    // No confirmed role — don't redirect, let them stay on the auth page
    // This prevents the loop: dashboard rejects → login → dashboard rejects → ...
  }

  return supabaseResponse;
}
