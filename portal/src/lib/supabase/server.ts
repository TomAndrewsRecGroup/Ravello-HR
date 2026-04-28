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
 * Read the session: identity from cookie, feature flags fresh from DB.
 *
 * The middleware stamps tps_portal_session every 15 minutes with
 * userId, companyId, role, uiPreferences, etc. — those barely change
 * and reading them from the cookie keeps the hot path cheap.
 *
 * Feature flags are different. When admin staff toggle a module on or
 * off in the admin portal, that change needs to land in the client
 * portal IMMEDIATELY — not "when their session cookie expires in up to
 * 15 minutes". So we always re-read feature_flags from the DB on every
 * request. One small indexed select; React's `cache()` dedupes
 * multiple `getSessionProfile()` calls inside the same request.
 */
export const getSessionProfile = cache(async () => {
  const cookieStore = cookies();
  const raw = cookieStore.get('tps_portal_session')?.value;

  if (!raw) {
    return { user: null, profile: null, companyId: '', role: '', isTpsStaff: false, featureFlags: {} as Record<string, boolean> };
  }

  let session: any;
  try {
    session = JSON.parse(raw);
  } catch (err) {
    console.error('[getSessionProfile] Failed to parse session cookie:', err instanceof Error ? err.message : 'unknown error');
    return { user: null, profile: null, companyId: '', role: '', isTpsStaff: false, featureFlags: {} as Record<string, boolean> };
  }

  const companyId: string = session.companyId ?? '';
  const role: string     = session.role ?? '';
  const isTpsStaff: boolean = session.isTpsStaff ?? false;

  // Always re-read feature flags from the DB so admin module-access
  // changes surface on the next page load, not after a cookie cycle.
  // The cookie's stale `featureFlags` is intentionally ignored.
  let featureFlags: Record<string, boolean> = {};
  if (companyId) {
    try {
      const supabase = createServerSupabaseClient();
      const { data } = await supabase
        .from('companies')
        .select('feature_flags')
        .eq('id', companyId)
        .maybeSingle();
      featureFlags = ((data as any)?.feature_flags ?? {}) as Record<string, boolean>;
    } catch (err) {
      // If the live read fails, fall back to whatever the cookie has.
      // This mirrors the previous behaviour rather than logging the
      // user out on a transient blip.
      console.warn('[getSessionProfile] live flag read failed, using cookie fallback');
      featureFlags = (session.featureFlags ?? {}) as Record<string, boolean>;
    }
  }

  return {
    user: { id: session.userId, email: session.email } as any,
    profile: {
      company_id: companyId,
      ui_preferences: session.uiPreferences ?? {},
      onboarding_completed: session.onboardingCompleted ?? true,
    },
    companyId,
    role,
    isTpsStaff,
    featureFlags,
  };
});
