import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { PORTAL_SESSION_COOKIE, verifyPortalSession } from '@/lib/auth/portalSession';

// Per-company "shell" row: name, logo, feature_flags, stripe sub id,
// archived_at. Read on every authed page render — and previously
// re-fetched on every render. Now memoised through unstable_cache
// for 30s with a tag the admin app revalidates on feature-flag /
// archive / billing mutations (see admin's revalidateTag('client:<id>')
// callsites). 30s TTL is the worst-case latency for a flag toggle to
// reach the portal — admin's tag-bust shortens that to ~immediate
// when both projects share the same Vercel cache namespace.
//
// Service-role client used inside the cache because unstable_cache
// callbacks don't carry the request's auth cookies. Safe here because:
// (a) the calling getSessionProfile already verified the HMAC-signed
// session cookie and has a trusted companyId; (b) we only return
// the requester's own company shell — no cross-tenant exposure.
function fetchCompanyShellCached(companyId: string) {
  return unstable_cache(
    async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return null;
      const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data } = await sb
        .from('companies')
        .select('name, logo_url, feature_flags, stripe_subscription_id, archived_at, account_owner_id, account_owner:account_owner_id(full_name, email)')
        .eq('id', companyId)
        .maybeSingle();
      return data ?? null;
    },
    ['portal-company-shell', companyId],
    { revalidate: 30, tags: [`client:${companyId}`] },
  )();
}

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
  const raw = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;

  const empty = {
    user: null, profile: null,
    companyId: '', companyName: null as string | null,
    companyLogoUrl: null as string | null,
    role: '', isTpsStaff: false,
    featureFlags: {} as Record<string, boolean>,
    stripeSubscriptionId: null as string | null,
    archivedAt: null as string | null,
    accountManagerName:  null as string | null,
    accountManagerEmail: null as string | null,
  };

  if (!raw) return empty;

  // CRITICAL: verifyPortalSession() returns null on a tampered cookie,
  // a missing PORTAL_SESSION_SECRET env, or any malformed payload. We
  // MUST NOT trust the JSON contents otherwise — claims like companyId
  // and isTpsStaff would be attacker-controlled.
  const session = await verifyPortalSession(raw);
  if (!session) {
    if (raw && !process.env.PORTAL_SESSION_SECRET) {
      console.error('[getSessionProfile] PORTAL_SESSION_SECRET missing — treating session as invalid');
    }
    return empty;
  }

  const companyId: string = session.companyId ?? '';
  const role: string     = session.role ?? '';
  const isTpsStaff: boolean = session.isTpsStaff ?? false;

  // One round-trip pulls everything per-request consumers need from
  // the companies row: feature_flags (must be fresh so admin toggles
  // propagate immediately), name (header / dashboard) and the stripe
  // subscription id (billing nav). Previously layout, dashboard and
  // metrics each ran their own companies select — three round-trips
  // collapsed into one.
  let featureFlags: Record<string, boolean> = {};
  let companyName: string | null = null;
  let companyLogoUrl: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let archivedAt: string | null = null;
  let accountManagerName:  string | null = null;
  let accountManagerEmail: string | null = null;

  if (companyId) {
    try {
      const row: any = await fetchCompanyShellCached(companyId);
      if (row) {
        featureFlags        = (row.feature_flags ?? {}) as Record<string, boolean>;
        companyName         = row.name ?? null;
        companyLogoUrl      = row.logo_url ?? null;
        stripeSubscriptionId= row.stripe_subscription_id ?? null;
        archivedAt          = row.archived_at ?? null;
        // account_owner is the Supabase nested-select alias from the
        // shell query; the join may return null for clients that
        // don't have an owner assigned.
        accountManagerName  = row.account_owner?.full_name ?? null;
        accountManagerEmail = row.account_owner?.email     ?? null;
      } else {
        featureFlags = (session.featureFlags ?? {}) as Record<string, boolean>;
      }
    } catch (err) {
      console.warn('[getSessionProfile] cached company shell read failed, using cookie fallback');
      featureFlags = (session.featureFlags ?? {}) as Record<string, boolean>;
    }
  }

  return {
    user: { id: session.userId, email: session.email } as any,
    profile: {
      company_id: companyId,
      ui_preferences: session.uiPreferences ?? {},
      onboarding_completed: session.onboardingCompleted ?? true,
      full_name: session.fullName ?? null,
    },
    companyId,
    companyName,
    companyLogoUrl,
    role,
    isTpsStaff,
    featureFlags,
    stripeSubscriptionId,
    archivedAt,
    accountManagerName,
    accountManagerEmail,
  };
});
