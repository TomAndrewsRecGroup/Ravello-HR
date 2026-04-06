import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import OrgChartClient from './OrgChartClient';

export const metadata: Metadata = { title: 'Organisation Chart' };

export default async function OrgChartPage() {
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

  const { data: employees } = await supabase
    .from('employee_records')
    .select('id, full_name, job_title, department, line_manager, status, employment_type')
    .eq('company_id', companyId)
    .neq('status', 'terminated')
    .order('full_name');

  return (
    <main className="portal-page flex-1">
      <OrgChartClient employees={employees ?? []} />
    </main>
  );
}
