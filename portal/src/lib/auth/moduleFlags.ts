import { getSessionProfile } from '@/lib/supabase/server';

/** The flags to apply for the current viewer — fresh from the DB via
 *  getSessionProfile(). TPS staff with no company of their own have
 *  none, the same rule the portal layout applies to the sidebar. */
export async function currentModuleFlags(): Promise<Record<string, boolean>> {
  const { isTpsStaff, companyId, featureFlags } = await getSessionProfile();
  return (isTpsStaff && !companyId) ? {} : (featureFlags ?? {});
}
