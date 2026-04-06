import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: Record<string, unknown>) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: Record<string, unknown>) { cookieStore.set({ name, value: '', ...options }); },
      },
    },
  );
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL('/auth/login', request.url));
  // Clear session cookie so middleware re-validates on next login
  res.cookies.set('tps_portal_session', '', { maxAge: 0, path: '/' });
  return res;
}
