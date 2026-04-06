import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

export function createServerSupabaseClient() {
  const cookieStore = cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set',
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Safe to ignore in read-only server component contexts.
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Safe to ignore in read-only contexts.
        }
      },
    },
  });
}

/**
 * Cached per-request: fetches the current user + profile in ONE round-trip batch.
 *
 * Uses getSession() instead of getUser() for speed — getSession() reads the JWT
 * from cookies locally without hitting the Supabase Auth API over the network.
 * The middleware already validated the session via getUser(), so by the time a
 * layout/page runs, the session is trustworthy.
 *
 * React cache() deduplicates within a single server request, so layout + page
 * + nested layouts all share ONE call.
 */
export const getSessionProfile = cache(async () => {
  const supabase = createServerSupabaseClient();

  // getSession() reads JWT locally — no network call (middleware already validated)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { user: null, profile: null, companyId: '', role: '', isTpsStaff: false };

  const user = session.user;

  // Batch: role RPC + profile in parallel (2 queries, 1 round-trip via HTTP/2)
  const [{ data: rpcRole }, { data: profile }] = await Promise.all([
    supabase.rpc('get_my_role'),
    supabase.from('profiles').select('company_id, ui_preferences, onboarding_completed').eq('id', user.id).single(),
  ]);

  const role = typeof rpcRole === 'string' ? rpcRole : '';
  const isTpsStaff = role === 'tps_admin' || role === 'tps_client';
  const companyId: string = (profile as any)?.company_id ?? '';

  return { user, profile, companyId, role, isTpsStaff };
});
