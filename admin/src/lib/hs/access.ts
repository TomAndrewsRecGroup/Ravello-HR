import type { SupabaseClient } from '@supabase/supabase-js';
import type { HsMyCompany } from './types';
import type { HsScope } from './vocab';

/**
 * This user's grant on one client, from hs_my_companies(), or null.
 * For deciding what to SHOW (a form, a tab). It is not the boundary:
 * RLS re-checks every read and write against the same assignment.
 */
export async function myGrant(supabase: SupabaseClient, companyId: string): Promise<HsMyCompany | null> {
  const { data } = await supabase.rpc('hs_my_companies');
  return ((data ?? []) as HsMyCompany[]).find(c => c.company_id === companyId) ?? null;
}

export function canWrite(grant: HsMyCompany | null, scope: HsScope): boolean {
  return !!grant && grant.access_level === 'write' && grant.scopes.includes(scope);
}
