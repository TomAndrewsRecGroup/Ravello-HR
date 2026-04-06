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
          // set can be called from Server Components where cookies are read-only.
          // This is safe to ignore — the middleware will handle refreshing the session.
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Same as above — safe to ignore in read-only contexts.
        }
      },
    },
  });
}

/**
 * Cached per-request: fetches the current user + their profile in a single call.
 * React cache() deduplicates within the same server request, so layout + page
 * + nested layouts all share one DB round-trip instead of 3–4.
 */
export const getSessionProfile = cache(async () => {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, companyId: '', role: '', isTpsStaff: false };

  // Use SECURITY DEFINER function to bypass RLS circular dependency
  const [{ data: rpcRole }, { data: profile }] = await Promise.all([
    supabase.rpc('get_my_role'),
    supabase.from('profiles').select('company_id, ui_preferences, onboarding_completed').eq('id', user.id).single(),
  ]);

  const role = typeof rpcRole === 'string' ? rpcRole : '';
  const isTpsStaff = role === 'tps_admin' || role === 'tps_client';
  const companyId: string = (profile as any)?.company_id ?? '';

  return { user, profile, companyId, role, isTpsStaff };
});
