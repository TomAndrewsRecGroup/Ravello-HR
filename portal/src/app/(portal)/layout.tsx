import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import PortalShell from '@/components/layout/PortalShell';

// Fetch sidebar badge counts — separated so it doesn't block page rendering
async function getSidebarCounts(companyId: string, userId: string) {
  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();

  const [actRes, tickRes, candRes, compRes, empDocRes, absenceRes, notifRes] = await Promise.all([
    supabase.from('actions').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'active')
      .or(`dismiss_until.is.null,dismiss_until.lt.${now}`),
    supabase.from('tickets').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).in('status', ['open', 'in_progress']),
    supabase.from('candidates').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('approved_for_client', true).eq('client_status', 'pending'),
    supabase.from('compliance_items').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).in('status', ['pending', 'overdue']),
    supabase.from('employee_documents').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'expired'),
    supabase.from('absence_records').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'pending'),
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('read', false),
  ]);

  return {
    actions: actRes.count ?? 0,
    tickets: tickRes.count ?? 0,
    candidates: candRes.count ?? 0,
    compliance: compRes.count ?? 0,
    emp_docs_expired: empDocRes.count ?? 0,
    absence_pending: absenceRes.count ?? 0,
    notifications: notifRes.count ?? 0,
  };
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, companyId, isTpsStaff } = await getSessionProfile();

  if (!user) redirect('/auth/login');

  if (!profile && !isTpsStaff) redirect('/auth/login?reason=no-profile');

  if (profile && (profile as any).onboarding_completed === false && !isTpsStaff) {
    redirect('/onboarding');
  }

  // Fetch flags and counts in parallel — don't waterfall
  let flags: Record<string, boolean> = {};
  let counts: Record<string, number> = {};
  const uiPreferences = (profile as any)?.ui_preferences ?? {};

  if (isTpsStaff && !companyId) {
    flags = {};
  } else if (companyId) {
    const supabase = createServerSupabaseClient();
    const [{ data: company }, sidebarCounts] = await Promise.all([
      supabase.from('companies').select('feature_flags').eq('id', companyId).single(),
      getSidebarCounts(companyId, user.id),
    ]);
    flags = (company as any)?.feature_flags ?? {};
    counts = sidebarCounts;
  }

  return (
    <PortalShell flags={flags} counts={counts} userId={user.id} uiPreferences={uiPreferences}>
      {children}
    </PortalShell>
  );
}
