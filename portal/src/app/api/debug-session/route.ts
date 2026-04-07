import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * GET /api/debug-session
 *
 * Comprehensive auth debug endpoint. Uses SERVICE ROLE key to bypass
 * RLS entirely — shows the true state of the database.
 */
export async function GET() {
  const cookieStore = cookies();
  const sessionRaw = cookieStore.get('tps_portal_session')?.value;

  let sessionData = null;
  if (sessionRaw) {
    try { sessionData = JSON.parse(sessionRaw); } catch {}
  }

  // Use anon client for auth check
  const anonClient = createServerClient(
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

  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      diagnosis: 'Not authenticated — no valid Supabase session found',
      sessionCookie: sessionData,
    });
  }

  // Use service role to bypass ALL RLS — see the truth
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let liveProfile = null;
  let profileError = null;
  let liveRole = null;
  let roleError = null;
  let companyData = null;
  let companyError = null;
  let demoCompanyExists = false;

  if (serviceKey) {
    const adminClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      {
        cookies: { get() { return undefined; }, set() {}, remove() {} },
      },
    );

    // Check profile
    const profRes = await adminClient.from('profiles')
      .select('id, email, role, company_id, full_name, onboarding_completed')
      .eq('id', user.id)
      .single();
    liveProfile = profRes.data;
    profileError = profRes.error?.message ?? null;

    // Check role via RPC (still uses anon to test RPC works)
    const roleRes = await anonClient.rpc('get_my_role');
    liveRole = roleRes.data;
    roleError = roleRes.error?.message ?? null;

    // Check if demo company exists
    const compRes = await adminClient.from('companies')
      .select('id, name, active, feature_flags')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();
    companyData = compRes.data;
    companyError = compRes.error?.message ?? null;
    demoCompanyExists = !!compRes.data;

    // Check if RLS is blocking the anon profile query
    const anonProfileRes = await anonClient.from('profiles')
      .select('id, role, company_id')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      sessionCookie: sessionData,
      liveProfile,
      profileError,
      liveRole,
      roleError,
      demoCompanyExists,
      companyData,
      companyError,
      rlsTest: {
        anonProfileQuery: anonProfileRes.data ? 'PASSES' : 'BLOCKED',
        anonProfileError: anonProfileRes.error?.message ?? null,
      },
      diagnosis: !liveProfile
        ? 'Profile row missing — run: INSERT INTO profiles (id,email,role,company_id,onboarding_completed) VALUES (\'' + user.id + '\',\'' + user.email + '\',\'tps_admin\',\'00000000-0000-0000-0000-000000000001\',true);'
        : liveProfile.role !== 'tps_admin' && liveProfile.role !== 'tps_client'
        ? 'Role is ' + liveProfile.role + ' — needs to be tps_admin'
        : !liveProfile.company_id
        ? 'No company_id — needs linking to demo company'
        : !demoCompanyExists
        ? 'Demo company does not exist — run migration 024'
        : anonProfileRes.error
        ? 'RLS is BLOCKING profile reads — run migration 028 to fix circular RLS'
        : sessionData?.companyId
        ? 'Everything looks correct — clear cookies and re-login'
        : 'Profile OK but session cookie has no companyId — clear cookies and re-login',
    });
  }

  // No service key — limited debug
  const roleRes = await anonClient.rpc('get_my_role');
  const profRes = await anonClient.from('profiles')
    .select('id, email, role, company_id, onboarding_completed')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    authenticated: true,
    userId: user.id,
    email: user.email,
    sessionCookie: sessionData,
    liveProfile: profRes.data,
    profileError: profRes.error?.message ?? null,
    liveRole: roleRes.data,
    roleError: roleRes.error?.message ?? null,
    note: 'No SUPABASE_SERVICE_ROLE_KEY — profile query may be blocked by RLS',
    diagnosis: profRes.error ? 'RLS blocking profile query: ' + profRes.error.message : 'Check liveProfile data',
  });
}
