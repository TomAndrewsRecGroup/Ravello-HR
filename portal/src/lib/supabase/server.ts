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
        } catch {}
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {}
      },
    },
  });
}

/**
 * Read the session from the middleware-stamped cookie — ZERO Supabase calls.
 *
 * The middleware validates the user via getUser() once every 15 minutes and
 * stamps a tps_portal_session cookie with userId, companyId, role, etc.
 * Layouts and pages just read this cookie. No network calls at all.
 *
 * React cache() deduplicates within a single request.
 */
export const getSessionProfile = cache(async () => {
  const cookieStore = cookies();
  const raw = cookieStore.get('tps_portal_session')?.value;

  if (!raw) {
    return { user: null, profile: null, companyId: '', role: '', isTpsStaff: false };
  }

  try {
    const session = JSON.parse(raw);
    return {
      user: { id: session.userId, email: session.email } as any,
      profile: {
        company_id: session.companyId,
        ui_preferences: session.uiPreferences ?? {},
        onboarding_completed: session.onboardingCompleted ?? true,
      },
      companyId: session.companyId ?? '',
      role: session.role ?? '',
      isTpsStaff: session.isTpsStaff ?? false,
    };
  } catch {
    return { user: null, profile: null, companyId: '', role: '', isTpsStaff: false };
  }
});
