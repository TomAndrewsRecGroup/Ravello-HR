import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import PortalShell from '@/components/layout/PortalShell';
import { hasPaidFlag } from '@/lib/featureFlags';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, companyId, role, isTpsStaff, featureFlags } = await getSessionProfile();

  if (!user) redirect('/auth/login');
  if (!profile && !isTpsStaff) redirect('/auth/login?reason=no-profile');

  // Feature flags are read fresh from the DB on every request inside
  // getSessionProfile() so admin module-access changes propagate to
  // the client portal instantly. The session cookie no longer caches
  // them.
  const flags = (isTpsStaff && !companyId) ? {} : featureFlags;
  const uiPreferences = (profile as any)?.ui_preferences ?? {};
  const paidEnabled = hasPaidFlag(flags);

  // Onboarding wizard is for paid clients only — its 5 steps (Friction
  // Lens / first employee / etc.) all map to paid modules. Free-only
  // clients (e.g. Athletes To Industry) skip it entirely and land on
  // their dashboard. If they later upgrade to a paid module, the wizard
  // re-engages because onboarding_completed stays false.
  if (
    profile &&
    (profile as any).onboarding_completed === false &&
    !isTpsStaff &&
    paidEnabled
  ) {
    redirect('/onboarding');
  }

  // Sidebar badge counts: pre-fetch SSR so badges paint with the layout
  // (was three browser-side queries firing on every cold mount).
  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();
  const counts: Record<string, number> = { actions: 0, tickets: 0, candidates: 0 };
  let hasStripeSub = false;
  if (companyId) {
    const [actRes, tickRes, candRes, billingRes] = await Promise.all([
      supabase.from('actions').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'active')
        .or(`dismiss_until.is.null,dismiss_until.lt.${now}`),
      supabase.from('tickets').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).in('status', ['open', 'in_progress']),
      supabase.from('candidates').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('approved_for_client', true).eq('client_status', 'pending'),
      supabase.from('companies').select('stripe_subscription_id').eq('id', companyId).maybeSingle(),
    ]);
    counts.actions    = actRes.count    ?? 0;
    counts.tickets    = tickRes.count   ?? 0;
    counts.candidates = candRes.count   ?? 0;
    hasStripeSub = !!(billingRes.data as any)?.stripe_subscription_id;
  }

  // Billing nav entry shows when there's something to manage:
  // a paid flag is on, or there's a live Stripe sub (covers the case
  // where admin downgraded but the sub is still running until period end
  // — the client should still be able to manage their card / view past
  // invoices). TPS staff always see it for support purposes.
  const showBilling = isTpsStaff || paidEnabled || hasStripeSub;

  return (
    <PortalShell
      flags={flags}
      counts={counts}
      userId={user.id}
      companyId={companyId}
      role={role}
      showBilling={showBilling}
      uiPreferences={uiPreferences}
    >
      {children}
    </PortalShell>
  );
}
