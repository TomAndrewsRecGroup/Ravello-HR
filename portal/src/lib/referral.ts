import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Shared helpers for the public (unauthenticated) referral routes/pages.
// Anonymous submissions can't satisfy RLS, so these use the service-role
// client. The key is already configured for portal (used by the cached
// company-shell read in lib/supabase/server.ts).

export const A2I_FLAG_KEY = 'athletes_to_industry';
export const PARTNER_NOTIFY_EMAIL =
  process.env.A2I_PARTNER_NOTIFY_EMAIL ?? 'tom@andrews-recruitment.com';

export interface ReferralCompany {
  id: string;
  name: string;
  slug: string;
  feature_flags: Record<string, unknown> | null;
}

/** Service-role Supabase client (bypasses RLS). Returns null if unconfigured. */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A2I is enabled unless the flag is explicitly false (matches portal convention). */
export function a2iEnabled(flags: Record<string, unknown> | null | undefined): boolean {
  return (flags ?? {})[A2I_FLAG_KEY] !== false;
}

/**
 * Look up a client company by slug for a referral page/route. Returns the
 * company only when it exists AND has the Athletes To Industry feature on;
 * otherwise null (callers treat null as a 404).
 */
export async function findReferralCompany(
  supabase: SupabaseClient,
  slug: string,
): Promise<ReferralCompany | null> {
  const cleaned = (slug ?? '').trim().toLowerCase();
  if (!cleaned) return null;
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, slug, feature_flags')
    .eq('slug', cleaned)
    .maybeSingle();
  if (error || !data) return null;
  if (!a2iEnabled(data.feature_flags as Record<string, unknown> | null)) return null;
  return data as ReferralCompany;
}
