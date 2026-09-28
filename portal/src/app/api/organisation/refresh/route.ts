import { NextResponse, type NextRequest } from 'next/server';
import { PORTAL_SESSION_COOKIE } from '@/lib/auth/portalSession';

// Drops the cached session cookie and sends the user back to the
// dashboard. The portal layout redirects here when the cookie names a
// different organisation from the database (a switch in another tab, a
// revoked or expired grant); the middleware then re-mints the cookie
// from the database on the very next request. Always lands on
// /dashboard — never a caller-supplied URL, so this cannot be used as an
// open redirect.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/dashboard';
  url.search = '';
  const res = NextResponse.redirect(url);
  res.cookies.set(PORTAL_SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
