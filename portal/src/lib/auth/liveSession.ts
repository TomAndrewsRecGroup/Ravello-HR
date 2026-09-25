import { createServerSupabaseClient } from '@/lib/supabase/server';

// Who is calling, checked against Supabase NOW — for routes that act
// with the SERVICE ROLE.
//
// getSessionProfile() reads the signed tps_portal_session cookie, which
// is right for rendering pages (cheap, and every read those pages make
// goes through the user's own JWT, so RLS still decides). It is not
// enough for a route that writes with the service role: RLS and 088's
// guards do not apply to those writes, so the ROUTE is the boundary,
// and a cookie only says what was true when it was minted (up to 15
// minutes ago). A user removed, demoted or moved in the meantime is
// still "client_admin of company A" in their cookie.
//
// This verifies the Supabase JWT (auth.getUser round-trips to Auth) and
// reads role and company fresh through the SECURITY DEFINER RPCs the
// middleware already uses. Null means: no live session — refuse.

export interface LiveSession {
  userId:    string;
  email:     string | null;
  role:      string;
  companyId: string | null;
}

export async function requireLiveSession(): Promise<LiveSession | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: role, error: roleErr }, { data: profileRows, error: profErr }] = await Promise.all([
    supabase.rpc('get_my_role'),
    supabase.rpc('get_my_profile'),
  ]);
  if (roleErr || profErr || typeof role !== 'string') return null;

  const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;
  return {
    userId:    user.id,
    email:     user.email ?? null,
    role,
    companyId: (profile as { company_id?: string | null } | null)?.company_id ?? null,
  };
}
