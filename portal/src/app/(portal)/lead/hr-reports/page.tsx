import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import HRReportsClient from './HRReportsClient';

export const metadata: Metadata = { title: 'HR Reports' };

export default async function HRReportsPage() {
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

  const [empRes, leaveRes] = await Promise.all([
    supabase
      .from('employee_records')
      .select('id, full_name, job_title, department, employment_type, status, start_date, end_date, gender, ethnicity, disability_status, annual_leave_allowance, sick_day_allowance, leave_year_type, leave_year_start_month, leave_year_start_day')
      .eq('company_id', companyId)
      .order('start_date'),
    supabase
      .from('leave_records')
      .select('*, employee_records(full_name, department)')
      .eq('company_id', companyId)
      .order('start_date'),
  ]);

  return (
    <main className="portal-page flex-1">
      <HRReportsClient
        employees={empRes.data ?? []}
        leaveRecords={leaveRes.data ?? []}
      />
    </main>
  );
}
