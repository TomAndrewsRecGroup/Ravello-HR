// Shared staff-auth helper for admin API routes.
// Uses the get_my_role() SECURITY DEFINER RPC (migration 022/030) so we
// get the caller's role in a single round trip instead of two
// (auth.getUser + profiles.select).
//
// Usage:
//   const auth = await requireStaff();
//   if (!auth.ok) return auth.response;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface AuthOk {
  ok:   true;
  role: 'tps_admin';
  userId: string;
}
export interface AuthFail {
  ok:       false;
  response: NextResponse;
}

export async function requireStaff(): Promise<AuthOk | AuthFail> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'tps_admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, role: 'tps_admin', userId: user.id };
}
