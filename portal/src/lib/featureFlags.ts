import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Server-side feature flag enforcement.
 * Call at the top of any page.tsx that should be gated behind a feature flag.
 * Redirects to /dashboard if the flag is disabled.
 *
 * Usage:
 *   await enforceFeatureFlag('hiring');
 *
 * Per CLAUDE.md: check flags.X === false (not !flags.X) so undefined defaults to ENABLED.
 */
export async function enforceFeatureFlag(flagKey: string): Promise<{
  companyId: string;
  userId: string;
  flags: Record<string, boolean>;
}> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, companies(feature_flags)')
    .eq('id', user.id)
    .single();

  const flags: Record<string, boolean> = (profile as any)?.companies?.feature_flags ?? {};
  const companyId: string = (profile as any)?.company_id ?? '';

  // Per convention: flags.X === false means disabled. undefined/null = enabled.
  if (flags[flagKey] === false) {
    redirect('/dashboard');
  }

  return { companyId, userId: user.id, flags };
}

/**
 * Get user context without enforcing a flag.
 * Useful for pages that always need auth but no flag check.
 */
export async function getAuthContext(): Promise<{
  companyId: string;
  userId: string;
  role: string;
  flags: Record<string, boolean>;
}> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role, companies(feature_flags)')
    .eq('id', user.id)
    .single();

  return {
    companyId: (profile as any)?.company_id ?? '',
    userId: user.id,
    role: (profile as any)?.role ?? '',
    flags: (profile as any)?.companies?.feature_flags ?? {},
  };
}
