import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import HRDashboardClient from './HRDashboardClient';

export const metadata: Metadata = { title: 'HR Dashboard' };
export const revalidate = 30;

export default async function HRDashboardPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) redirect('/auth/login');
  if (!companyId) return (
    <main className="portal-page flex-1">
      <div className="card p-12 text-center">
        <div className="empty-state">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No company linked</p>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>This page will populate once your company profile is set up.</p>
        </div>
      </div>
    </main>
  );

  const [
    { data: metrics },
    { count: empDocCount },
    { count: expiredDocs },
    { count: absencePending },
    { count: openTraining },
    { count: pendingReviews },
  ] = await Promise.all([
    supabase.from('hr_metrics').select('id,period,headcount,turnover_rate,absence_rate,training_completion,avg_time_to_hire').eq('company_id', companyId).order('period', { ascending: false }).limit(4),
    supabase.from('employee_documents').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
    supabase.from('employee_documents').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'expired'),
    supabase.from('absence_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
    supabase.from('training_needs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'open'),
    supabase.from('performance_reviews').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['pending', 'in_progress']),
  ]);

  return (
      <main className="portal-page flex-1">
        <HRDashboardClient
          companyId={companyId}
          initialMetrics={metrics ?? []}
          empDocCount={empDocCount ?? 0}
          expiredDocs={expiredDocs ?? 0}
          absencePending={absencePending ?? 0}
          openTraining={openTraining ?? 0}
          pendingReviews={pendingReviews ?? 0}
        />
      </main>
  );
}
