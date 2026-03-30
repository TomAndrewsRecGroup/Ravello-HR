import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Sidebar from '@/components/layout/Sidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let flags:  Record<string, boolean> = {};
  let counts: Record<string, number>  = {};

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed, company_id, companies(feature_flags)')
      .eq('id', user.id)
      .single();

    if (profile && (profile as any).onboarding_completed === false) {
      redirect('/onboarding');
    }

    flags = (profile as any)?.companies?.feature_flags ?? {};
    const companyId: string = (profile as any)?.company_id ?? '';

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

      // Separate queries for new tables (may not exist yet in all envs)
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
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar flags={flags} counts={counts} />
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        {children}
      </div>
    </div>
  );
}
