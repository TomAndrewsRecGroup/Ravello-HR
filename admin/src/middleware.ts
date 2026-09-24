import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Static files are excluded by FOLDER, not by extension. The exclusion
// used to be any path ending in .svg/.png/.woff2/…, which also skipped
// the middleware for /clients/x.png, /hiring/x.svg and every other
// dynamic page whose last segment carried one of those endings — so
// the only auth on that request was whatever the page layout did. Every
// file in public/ lives under brand/ or fonts/ or is named here.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|brand/|fonts/).*)'],
};
