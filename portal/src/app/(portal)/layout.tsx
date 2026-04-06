import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import PortalShell from '@/components/layout/PortalShell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  let flags:  Record<string, boolean> = {};
  let counts: Record<string, number>  = {};
  let uiPreferences: Record<string, any> = {};

  // Use SECURITY DEFINER function to bypass RLS circular dependency
  const { data: role } = await supabase.rpc('get_my_role');
  const isTpsStaff = role === 'tps_admin' || role === 'tps_client';

  // Try to fetch profile — may fail for TPS staff without company_id due to RLS
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, company_id, ui_preferences, companies(feature_flags)')
    .eq('id', user.id)
    .single();

  // If no profile and not TPS staff, redirect to login
  if (!profile && !isTpsStaff) {
    redirect('/auth/login?reason=no-profile');
  }

  if (profile && (profile as any).onboarding_completed === false && !isTpsStaff) {
    redirect('/onboarding');
  }

  flags = (profile as any)?.companies?.feature_flags ?? {};
  uiPreferences = (profile as any)?.ui_preferences ?? {};
  const companyId: string = (profile as any)?.company_id ?? '';

  // TPS staff without a company see all features enabled, zero counts
  if (isTpsStaff && !companyId) {
    // Enable all features so TPS admins can see every page
    flags = {};
  }

  if (companyId) {
    const now = new Date().toISOString();
    const [actRes, tickRes, candRes, compRes] = await Promise.all([
      supabase
        .from('actions')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'active')
        .or(`dismiss_until.is.null,dismiss_until.lt.${now}`),
      supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['open', 'in_progress']),
      supabase
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('approved_for_client', true)
        .eq('client_status', 'pending'),
      supabase
        .from('compliance_items')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['pending', 'overdue']),
    ]);

    const [empDocRes, absenceRes, notifRes] = await Promise.all([
      supabase.from('employee_documents').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'expired'),
      supabase.from('absence_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
    ]);

    counts = {
      actions:    actRes.count  ?? 0,
      tickets:    tickRes.count ?? 0,
      candidates: candRes.count ?? 0,
      compliance: compRes.count ?? 0,
      emp_docs_expired: empDocRes.count ?? 0,
      absence_pending:  absenceRes.count ?? 0,
      notifications:    notifRes.count  ?? 0,
    };
  }

  return (
    <PortalShell flags={flags} counts={counts} userId={user.id} uiPreferences={uiPreferences}>
      {children}
    </PortalShell>
  );
}
