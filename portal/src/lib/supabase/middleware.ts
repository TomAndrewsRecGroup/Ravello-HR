import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
  /^\/auth\//,
  /^\/api\/learning\/webhook$/,
  /^\/api\/partner\//,
];

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
  const isPublicRoute = PUBLIC_ROUTES.some(pattern => pattern.test(pathname));

  // Log auth infrastructure errors (not routine "no session" cases)
  if (authError && authError.message !== 'Auth session missing!') {
    console.error('[auth] getUser failed:', authError.message);
  }

  // Unauthenticated on protected route → login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // Authenticated on auth pages → redirect to dashboard
  // Skip if reason param is present (user was just rejected — avoid redirect loop)
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
