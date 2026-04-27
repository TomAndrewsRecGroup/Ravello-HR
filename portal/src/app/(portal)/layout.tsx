import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import PortalShell from '@/components/layout/PortalShell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, companyId, role, isTpsStaff, featureFlags } = await getSessionProfile();

  if (!user) redirect('/auth/login');
  if (!profile && !isTpsStaff) redirect('/auth/login?reason=no-profile');
  if (profile && (profile as any).onboarding_completed === false && !isTpsStaff) {
    redirect('/onboarding');
  }

  // Feature flags come from the session cookie: no DB call needed.
  // Middleware stamps them every 15 minutes.
  const flags = (isTpsStaff && !companyId) ? {} : featureFlags;
  const uiPreferences = (profile as any)?.ui_preferences ?? {};

  // Sidebar badge counts: pre-fetch SSR so badges paint with the layout
  // (was three browser-side queries firing on every cold mount).
  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();
  const counts: Record<string, number> = { actions: 0, tickets: 0, candidates: 0 };
  if (companyId) {
    const [actRes, tickRes, candRes] = await Promise.all([
      supabase.from('actions').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'active')
        .or(`dismiss_until.is.null,dismiss_until.lt.${now}`),
      supabase.from('tickets').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).in('status', ['open', 'in_progress']),
      supabase.from('candidates').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('approved_for_client', true).eq('client_status', 'pending'),
    ]);
    counts.actions    = actRes.count    ?? 0;
    counts.tickets    = tickRes.count   ?? 0;
    counts.candidates = candRes.count   ?? 0;
  }

  return (
    <PortalShell flags={flags} counts={counts} userId={user.id} companyId={companyId} role={role} uiPreferences={uiPreferences}>
      {children}
    </PortalShell>
  );
}
