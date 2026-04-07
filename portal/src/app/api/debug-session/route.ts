import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/debug-session
 * Returns the current session state for debugging auth/data issues.
 * Only works for authenticated users.
 */
export async function GET() {
  const cookieStore = cookies();
  const sessionRaw = cookieStore.get('tps_portal_session')?.value;

  let sessionData = null;
  if (sessionRaw) {
    try { sessionData = JSON.parse(sessionRaw); } catch {}
  }

  // Also fetch live data from DB for comparison
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let liveProfile = null;
  let liveRole = null;
  let profileError = null;
  if (user) {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from('profiles').select('id, email, role, company_id, onboarding_completed').eq('id', user.id).single(),
      supabase.rpc('get_my_role'),
    ]);
    liveProfile = profileRes.data;
    profileError = profileRes.error?.message ?? null;
    liveRole = roleRes.data;
  }

  return NextResponse.json({
    authenticated: !!user,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    sessionCookie: sessionData,
    liveProfile,
    profileError,
    liveRole,
    diagnosis: !user
      ? 'Not authenticated — need to log in'
      : !liveProfile
      ? 'No profile row in database — handle_new_user trigger may have failed'
      : liveProfile.role === 'client_user'
      ? 'Role is client_user — need to UPDATE profiles SET role = \'tps_admin\' WHERE email = \'...\''
      : !liveProfile.company_id
      ? 'No company_id linked — run migration 027 or UPDATE profiles SET company_id = \'00000000-0000-0000-0000-000000000001\''
      : 'Profile looks correct — try logging out and back in to refresh the session cookie',
  }, { status: 200 });
}
