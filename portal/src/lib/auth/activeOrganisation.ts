// The organisation a signed-in user is ACTING in right now.
//
// Core-OS 360 Phase 1 (migration 117): a consultant may hold grants into
// several client organisations and works in exactly one at a time. The
// database decides which — my_company_id() returns the active
// organisation while its grant is live, otherwise the home company —
// and every RLS policy already runs through it.
//
// So app code must ask the database too. Reading profiles.company_id
// gives the HOME company: a consultant working inside a client would then
// query, insert and label records against their own consultancy — the
// exact "record created against the wrong client" the spec forbids.
// RLS would refuse most of those writes, but a refused write the user
// cannot understand is still a defect.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function effectiveCompanyId(supabase: SupabaseClient): Promise<string | null> {
  return (await readEffectiveCompany(supabase)).companyId;
}

/** Distinguishes "the database says: no company" from "we could not
 *  ask". The layout must only act on the first — redirecting on the
 *  second would loop for as long as the database is unreachable. */
export async function readEffectiveCompany(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; companyId: string | null }> {
  const { data, error } = await supabase.rpc('my_company_id');
  if (error) {
    console.error('[org] my_company_id failed:', error.message);
    return { ok: false, companyId: null };
  }
  return { ok: true, companyId: typeof data === 'string' && data ? data : null };
}

export interface OrganisationOption {
  organisation_id:   string;
  name:              string;
  organisation_type: string;
  role_key:          string | null;
  is_home:           boolean;
  is_active:         boolean;
}

/** Home plus every organisation the user holds a LIVE grant for. */
export async function myOrganisations(supabase: SupabaseClient): Promise<OrganisationOption[]> {
  const { data, error } = await supabase.rpc('my_organisations');
  if (error) {
    console.error('[org] my_organisations failed:', error.message);
    return [];
  }
  return (data ?? []) as OrganisationOption[];
}

/** A signed session cookie that names a different tenant from the
 *  database must not be trusted: switched in another tab, or the grant
 *  was revoked or expired. */
export function sessionIsStale(
  cookieCompanyId: string,
  live: { ok: boolean; companyId: string | null },
): boolean {
  if (!live.ok) return false;
  return (cookieCompanyId || null) !== (live.companyId || null);
}
