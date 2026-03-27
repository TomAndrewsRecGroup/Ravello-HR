import { NextResponse, type NextRequest } from 'next/server';

const UNLOCK_COOKIE = 'tpo_unlocked';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the gate page and its API route
  if (pathname === '/coming-soon' || pathname.startsWith('/api/unlock')) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // Gate check
  if (!request.cookies.get(UNLOCK_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/coming-soon';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
