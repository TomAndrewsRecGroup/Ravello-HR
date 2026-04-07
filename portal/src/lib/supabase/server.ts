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
 * The middleware stamps tps_portal_session every 15 minutes with:
 * userId, companyId, role, featureFlags, uiPreferences, etc.
 * Layouts and pages just read this cookie. No network calls at all.
 */
export const getSessionProfile = cache(async () => {
  const cookieStore = cookies();
  const raw = cookieStore.get('tps_portal_session')?.value;

  if (!raw) {
    return { user: null, profile: null, companyId: '', role: '', isTpsStaff: false, featureFlags: {} as Record<string, boolean> };
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
      featureFlags: session.featureFlags ?? {} as Record<string, boolean>,
    };
  } catch {
    return { user: null, profile: null, companyId: '', role: '', isTpsStaff: false, featureFlags: {} as Record<string, boolean> };
  }
});
