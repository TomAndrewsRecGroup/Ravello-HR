import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { requireLiveSession, type LiveSession } from '@/lib/auth/liveSession';
import type { PortfolioOrganisation } from './types';

// The Command Centre's one access check. portfolio_organisations() (167)
// is SECURITY DEFINER and reads auth.uid() itself — it MUST be called
// through the user's own session client, never the service role (which
// has no auth.uid() and would see nothing). Once we have the caller's
// own authorised org id list, bulk reads across all of them use the
// SERVICE ROLE — RLS cannot answer a cross-client question at all (see
// migration 167's own header comment), so every Command Centre read
// scopes itself with `.in('company_id', authorisedIds)` rather than
// relying on RLS to do it. The org id list itself came from the user's
// own valid grants, so this is never a wider read than RLS would allow
// one query at a time — just all of them, in the same batch.

export interface PortfolioSession {
  session: LiveSession;
  organisations: PortfolioOrganisation[];
}

/** Null when not signed in, or signed in with no portfolio access at all
 *  (an ordinary single-org client — not an error, just nothing to show). */
export async function requirePortfolioSession(): Promise<PortfolioSession | null> {
  const session = await requireLiveSession();
  if (!session) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('portfolio_organisations');
  if (error) return null;

  const organisations = (data ?? []) as PortfolioOrganisation[];
  return { session, organisations };
}

/** True when the caller's portfolio (167) includes this specific
 *  organisation — the same authorisation Client 360 and every
 *  per-client Command Centre route must check before a service-role
 *  read against that one company. */
export function portfolioIncludes(organisations: PortfolioOrganisation[], organisationId: string): boolean {
  return organisations.some(o => o.organisation_id === organisationId);
}

export function portfolioOrgIds(organisations: PortfolioOrganisation[]): string[] {
  return organisations.map(o => o.organisation_id);
}

export { createServiceSupabaseClient };
