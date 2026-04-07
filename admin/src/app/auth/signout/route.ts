import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function handleSignOut(request: Request) {
  const cookieStore = cookies();
  const supabase = createServerClient(
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
  res.cookies.set('tpo_admin_role', '', {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0, path: '/',
  });
  return res;
}

// Support both POST (form submit) and GET (direct navigation / PWA)
export const POST = handleSignOut;
export const GET = handleSignOut;
