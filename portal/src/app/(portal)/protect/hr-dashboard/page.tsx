import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import HRDashboardClient from './HRDashboardClient';

export const metadata: Metadata = { title: 'HR Dashboard' };

export default async function HRDashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  if (!companyId) return null;

  const [
    { data: metrics },
    { count: empDocCount },
    { count: expiredDocs },
    { count: absencePending },
    { count: openTraining },
    { count: pendingReviews },
  ] = await Promise.all([
    supabase.from('hr_metrics').select('*').eq('company_id', companyId).order('period', { ascending: false }).limit(4),
    supabase.from('employee_documents').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
    supabase.from('employee_documents').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'expired'),
    supabase.from('absence_records').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
    supabase.from('training_needs').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'open'),
    supabase.from('performance_reviews').select('*', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['pending', 'in_progress']),
  ]);

  return (
    <>
      <Topbar title="HR Dashboard" subtitle="Headcount, absence, compliance and people metrics" />
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
    </>
  );
}
