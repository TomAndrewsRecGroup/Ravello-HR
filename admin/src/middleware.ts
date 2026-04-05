import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Strip www. to keep cookies on a single canonical domain
  const host = request.headers.get('host') ?? '';
  if (host.startsWith('www.')) {
    const url = request.nextUrl.clone();
    url.host = host.replace(/^www\./, '');
    return NextResponse.redirect(url, 301);
  }

  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
