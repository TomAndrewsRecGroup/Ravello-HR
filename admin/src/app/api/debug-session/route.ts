import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// GET /api/debug-session
//
// Comprehensive diagnostic for "why isn't this working" cases.
// Returns the actual state the server sees for the calling user:
// auth, role, profile, company, cached cookies. Useful when the UI
// shows something wrong and you need to know whether the bug is in
// the data layer or the rendering layer.
//
// PROTECTED: blocked in production unless ENABLE_DEBUG_SESSION=true.
//   Returns 404 instead of 401 in production so it doesn't reveal
//   the endpoint exists.
//
// Returns the same shape as the portal /api/debug-session for parity.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_SESSION !== 'true') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  const cookieStore = cookies();

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

  // Service-role client for direct table reads — bypasses RLS so we
  // can see the truth even when an RLS bug is the cause.
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // What cookies exist (names only, never values)
  const cookieNames = cookieStore.getAll().map(c => c.name);
  const cachedRole  = cookieStore.get('tpo_admin_role')?.value ?? null;

  if (!user) {
    return NextResponse.json({
      authenticated:   false,
      authError:       authError?.message ?? null,
      cookieNames,
      cachedRole,
      diagnosis:       'No Supabase session found. Sign in first.',
    }, { status: 200 });
  }

  // RPC role (RLS-bypass via SECURITY DEFINER)
  const { data: rpcRole, error: rpcError } = await supabase.rpc('get_my_role');

  // Direct profile read (service role, bypasses RLS) so we can compare
  // the truth against what RLS / cached cookies report.
  const { data: dbProfile } = await adminClient
    .from('profiles')
    .select('id, email, full_name, role, company_id, onboarding_completed, onboarding_step, created_at')
    .eq('id', user.id)
    .maybeSingle();

  // Direct company read for the linked company, if any.
  let dbCompany: any = null;
  if (dbProfile?.company_id) {
    const { data } = await adminClient
      .from('companies')
      .select('id, name, active, sector, size_band, contact_email, feature_flags, monthly_retainer_pence, subscription_status')
      .eq('id', dbProfile.company_id)
      .maybeSingle();
    dbCompany = data;
  }

  // Counts the dashboard would see — useful when the dashboard says
  // X but the lists show Y.
  const [{ count: companyCount }, { count: clientUserCount }, { count: totalProfileCount }] = await Promise.all([
    adminClient.from('companies').select('*', { count: 'exact', head: true }).eq('active', true),
    adminClient.from('profiles').select('*', { count: 'exact', head: true }).neq('role', 'tps_admin'),
    adminClient.from('profiles').select('*', { count: 'exact', head: true }),
  ]);

  // Diagnosis: human-readable summary of what's likely wrong, if anything.
  let diagnosis: string;
  if (!dbProfile) {
    diagnosis = 'Auth user exists but no profiles row. The handle_new_user trigger may not have fired, or the row was deleted. Insert one manually.';
  } else if (!dbProfile.role) {
    diagnosis = 'Profile exists but role is NULL. Set role = \'tps_admin\' for staff or client_admin/client_editor for clients.';
  } else if (dbProfile.role !== rpcRole) {
    diagnosis = `Role mismatch — DB has ${dbProfile.role} but get_my_role() returned ${rpcRole}. Likely a session cookie issue. Sign out fully and back in.`;
  } else if (dbProfile.role !== 'tps_admin' && cachedRole === 'tps_admin') {
    diagnosis = 'Stale tpo_admin_role cookie. Clear cookies and sign in again.';
  } else if (dbProfile.role === 'tps_admin') {
    diagnosis = 'Staff account looks healthy. If the UI says you\'re unauthorised, hard-refresh after the latest deploy lands.';
  } else {
    diagnosis = `Account is a ${dbProfile.role}, not tps_admin — admin portal access requires tps_admin.`;
  }

  return NextResponse.json({
    authenticated:    true,
    userId:           user.id,
    email:            user.email,
    cookieNames,
    cachedRole,
    rpcRole:          rpcRole ?? null,
    rpcError:         rpcError?.message ?? null,
    dbProfile,
    dbCompany,
    counts: {
      activeCompanies: companyCount ?? 0,
      clientUsers:     clientUserCount ?? 0,
      totalProfiles:   totalProfileCount ?? 0,
    },
    diagnosis,
  });
}
