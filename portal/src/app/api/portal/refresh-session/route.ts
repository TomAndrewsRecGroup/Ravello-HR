import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PORTAL_SESSION_COOKIE } from '@/lib/auth/portalSession';

// POST /api/portal/refresh-session
//
// Clears the cached portal session cookie so the next request
// re-stamps it with fresh data from the database.
//
// Why we need this: the portal middleware caches profile state
// (onboarding_completed, featureFlags, role, companyId) in a
// session cookie with a 15-minute TTL. After a write that changes
// any of those flags — most notably finishing the onboarding
// wizard — the next page load reads the stale cookie and routes
// the user as if the change never happened (e.g. /dashboard
// layout sees onboarding_completed=false and bounces them back
// to /onboarding, which finds onboarding_completed=true and
// bounces them to /dashboard, infinite loop).
//
// Calling this endpoint from the client side after such a write,
// then triggering the navigation, ensures the middleware sees no
// cookie and stamps a fresh one with the post-write profile state.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  // Require an active Supabase auth session before clearing the
  // cookie. Otherwise an unauth'd POST could DoS another user's
  // session and force re-authentication. (No cross-user effect
  // since the cookie is httpOnly + same-origin, but we still want
  // to gate it on a real session.)
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  return NextResponse.json({ ok: true });
}
