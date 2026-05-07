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
// SECURITY:
//   - Anonymous callers get only auth=false response (no data leaked).
//   - Authenticated callers see their own profile + company.
//   - Aggregate counts (active companies / total users) are only
//     returned to tps_admin staff — not leaked to client users.
// No env-var gate — this endpoint reveals nothing the caller doesn't
// already know about themselves.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: import('next/server').NextRequest) {
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

  // Counts the dashboard would see — only returned to tps_admin so
  // anonymous / client users can't probe for org size.
  const isStaff = dbProfile?.role === 'tps_admin';
  let counts: { activeCompanies: number; clientUsers: number; totalProfiles: number } | null = null;
  // What the /users page query ACTUALLY returns from the user's
  // RLS-scoped session — vs the service-role count above. If the
  // count matches admin counts but the user-scoped list comes back
  // empty, RLS is the culprit. If both come back the same and the
  // UI still shows empty, the page is serving a stale cached render.
  let usersPageQuery: { rls_count: number | null; service_count: number; rls_rows: any[]; rls_error: string | null } | null = null;
  if (isStaff) {
    const [{ count: companyCount }, { count: clientUserCount }, { count: totalProfileCount }] = await Promise.all([
      adminClient.from('companies').select('*', { count: 'exact', head: true }).eq('active', true),
      adminClient.from('profiles').select('*', { count: 'exact', head: true }).neq('role', 'tps_admin'),
      adminClient.from('profiles').select('*', { count: 'exact', head: true }),
    ]);
    counts = {
      activeCompanies: companyCount     ?? 0,
      clientUsers:     clientUserCount  ?? 0,
      totalProfiles:   totalProfileCount ?? 0,
    };

    // Run the EXACT query the /users page runs, with the caller's
    // session (RLS active). If this differs from the service-role
    // count, RLS is filtering rows the page should see.
    //
    // We deliberately don't dump full rows in the response anymore
    // — the audit flagged that this endpoint was a one-shot exfil
    // surface for a compromised tps_admin. We expose the diagnostic
    // counts (the actual reason the route exists) but not the row
    // bodies; on `?rows=1` an opt-in returns redacted rows (email
    // local-part hashed) so an operator can still sanity-check
    // ordering / shape.
    const wantsRows = req.nextUrl.searchParams.get('rows') === '1';
    const [rlsListRes, rlsCountRes] = await Promise.all([
      wantsRows
        ? supabase
            .from('profiles')
            .select('id,email,role,company_id,created_at,companies(id,name)')
            .neq('role', 'tps_admin')
            .order('created_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: null, error: null } as any),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .neq('role', 'tps_admin'),
    ]);
    const redactedRows = (rlsListRes.data ?? []).map((r: any) => ({
      id:         r.id,
      email:      typeof r.email === 'string' ? r.email.replace(/^([^@]{1,2})[^@]*@/, '$1***@') : null,
      role:       r.role,
      company_id: r.company_id,
      company:    r.companies?.name ?? null,
      created_at: r.created_at,
    }));
    usersPageQuery = {
      rls_count:     rlsCountRes.count ?? null,
      service_count: counts.clientUsers,
      rls_rows:      redactedRows,
      rls_error:     rlsListRes.error?.message ?? rlsCountRes.error?.message ?? null,
    };
  }

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
    counts,
    usersPageQuery,
    diagnosis,
  });
}
