import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * GET /api/debug-session — comprehensive auth debug
 * Public route (bypasses middleware auth).
 */
export async function GET() {
  const cookieStore = cookies();

  // Show ALL cookies (names only, not values for security)
  const allCookieNames = cookieStore.getAll().map(c => c.name);
  const hasSbCookies = allCookieNames.some(n => n.startsWith('sb-'));

  // Session cookie
  const sessionRaw = cookieStore.get('tps_portal_session')?.value;
  let sessionData = null;
  if (sessionRaw) {
    try { sessionData = JSON.parse(sessionRaw); } catch {}
  }

  // Create Supabase client from request cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      authError: authError?.message ?? null,
      hasSbCookies,
      cookieNames: allCookieNames,
      sessionCookie: sessionData,
      diagnosis: hasSbCookies
        ? 'Has sb- cookies but getUser() failed — cookies may be expired or invalid'
        : 'No sb- auth cookies found — login did not set cookies, or they were cleared',
    });
  }

  // User is authenticated — check profile via RPC (bypasses RLS)
  const [roleRes, profileRes] = await Promise.all([
    supabase.rpc('get_my_role'),
    supabase.rpc('get_my_profile'),
  ]);

  const role = roleRes.data;
  const profileRows = profileRes.data;
  const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;

  // Check company
  let companyData = null;
  if (profile?.company_id) {
    const { data } = await supabase
      .from('companies')
      .select('id, name, active, feature_flags')
      .eq('id', profile.company_id)
      .single();
    companyData = data;
  }

  return NextResponse.json({
    authenticated: true,
    userId: user.id,
    email: user.email,
    hasSbCookies,
    sessionCookie: sessionData,
    rpcRole: role,
    rpcRoleError: roleRes.error?.message ?? null,
    rpcProfile: profile ?? null,
    rpcProfileError: profileRes.error?.message ?? null,
    companyData,
    diagnosis: profileRes.error
      ? 'get_my_profile() failed — have you run migration 029? Error: ' + profileRes.error.message
      : !profile
      ? 'Profile row missing — run INSERT INTO profiles ...'
      : !profile.company_id
      ? 'No company_id on profile — run UPDATE profiles SET company_id = ...'
      : !companyData
      ? 'Company query returned null — RLS may be blocking companies table. Run migration 028.'
      : !sessionData?.companyId
      ? 'Everything OK in DB but session cookie stale — navigate to /dashboard to force middleware refresh'
      : 'All good — profile, company, and session cookie are correct',
  });
}
