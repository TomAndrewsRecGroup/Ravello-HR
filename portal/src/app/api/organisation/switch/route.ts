import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PORTAL_SESSION_COOKIE } from '@/lib/auth/portalSession';
import { parseBody } from '@/lib/validation/parseBody';
import { getUserRateLimitKey, limiters, rateLimitResponse } from '@/lib/rateLimit';

// Switch the organisation this user is acting in.
//
// The database is the boundary: set_active_organisation() refuses any
// organisation without a live grant (42501) and records the switch in
// audit_events. This route only relays that, then DELETES the signed
// session cookie so the next request re-mints it from the database —
// the cookie caches the company for 15 minutes and must not keep naming
// the previous client. The browser then does a full navigation (never a
// client-side one), so no cached rows, open modal or half-filled form
// from the previous organisation survive the switch.

const Body = z.object({ organisationId: z.string().uuid().nullable() });

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const rl = limiters.write.check(getUserRateLimitKey(request, user.id));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await supabase.rpc('set_active_organisation', { p_org: parsed.data.organisationId });
  if (error) {
    // One answer for "no such organisation" and "not yours": the
    // difference would tell a caller which organisation ids exist.
    const denied = error.code === '42501';
    if (!denied) console.error('[org] set_active_organisation failed:', error.message);
    return NextResponse.json(
      { error: denied ? 'You do not have access to that organisation' : 'Could not switch organisation' },
      { status: denied ? 403 : 500 },
    );
  }

  const res = NextResponse.json({ organisationId: data ?? null });
  res.cookies.set(PORTAL_SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
