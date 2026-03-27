import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Dev session bypass ─────────────────────────────────────────────────────
  // Set by /api/dev-login when DEV_ADMIN_EMAIL + DEV_ADMIN_PASSWORD match.
  // Bypasses Supabase auth entirely for testing without a live DB.
  if (request.cookies.get('dev_session')?.value === '1') {
    return NextResponse.next({ request });
  }

  // ── Supabase session refresh ───────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  const isPublicRoute = pathname === '/auth/login' || pathname === '/auth/callback' || pathname === '/auth/reset-password';

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith('/auth') && !pathname.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
