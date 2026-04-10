import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * GET /api/debug-session — comprehensive auth debug
 *
 * PROTECTED: requires authenticated TPO staff (tps_admin / tps_client).
 * Returns diagnostic info about the current session and profile state.
 */
export async function GET() {
  // ── Block in production unless explicitly enabled ──
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_SESSION !== 'true') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  const cookieStore = cookies();

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

  // ── Auth gate: must be authenticated ──
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      authError: authError?.message ?? null,
      diagnosis: 'Not authenticated — log in first to use this endpoint',
    }, { status: 401 });
  }

  // ── Role gate: must be TPO staff ──
  const { data: roleData } = await supabase.rpc('get_my_role');
  if (!roleData || !['tps_admin', 'tps_client'].includes(roleData)) {
    return NextResponse.json({ error: 'Forbidden — TPO staff only' }, { status: 403 });
  }

  // Session cookie (names only for security — no raw values)
  const allCookieNames = cookieStore.getAll().map(c => c.name);
  const sessionRaw = cookieStore.get('tps_portal_session')?.value;
  let sessionData = null;
  if (sessionRaw) {
    try { sessionData = JSON.parse(sessionRaw); } catch {}
  }

  // Profile via RPC (bypasses RLS)
  const { data: profileRows, error: profileErr } = await supabase.rpc('get_my_profile');
  const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;

  // Company info
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
    cookieNames: allCookieNames,
    sessionCookie: sessionData,
    rpcRole: roleData,
    rpcProfile: profile ?? null,
    rpcProfileError: profileErr?.message ?? null,
    companyData,
    diagnosis: profileErr
      ? 'get_my_profile() failed — check migration 029. Error: ' + profileErr.message
      : !profile
      ? 'Profile row missing — INSERT INTO profiles required'
      : !profile.company_id
      ? 'No company_id on profile — UPDATE profiles SET company_id = ...'
      : !companyData
      ? 'Company query returned null — RLS may be blocking. Check migration 028.'
      : !sessionData?.companyId
      ? 'DB OK but session cookie stale — navigate to /dashboard to force middleware refresh'
      : 'All good — profile, company, and session cookie are correct',
  });
}
