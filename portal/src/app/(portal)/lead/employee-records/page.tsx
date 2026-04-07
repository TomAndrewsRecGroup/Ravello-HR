import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import EmployeeRecordsClient from './EmployeeRecordsClient';

export const metadata: Metadata = { title: 'Employee Records' };
export const revalidate = 30;

export default async function EmployeeRecordsPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId, role } = await getSessionProfile();
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

  const isAdmin = role === 'client_admin' || role === 'tps_admin' || role === 'tps_client';

  const [empRes, leaveRes] = await Promise.all([
    supabase
      .from('employee_records')
      .select('id,full_name,email,phone,job_title,department,employment_type,status,start_date,end_date,salary,salary_currency,gender,ethnicity,line_manager,annual_leave_allowance,sick_day_allowance,leave_year_type,created_at')
      .eq('company_id', companyId)
      .order('full_name'),
    supabase
      .from('leave_records')
      .select('id,employee_id,leave_type,start_date,end_date,days,status,notes')
      .eq('company_id', companyId)
      .order('start_date', { ascending: false }),
  ]);

  return (
    <main className="portal-page flex-1">
      <EmployeeRecordsClient
        companyId={companyId}
        userId={user.id}
        isAdmin={isAdmin}
        initialEmployees={empRes.data ?? []}
        leaveRecords={leaveRes.data ?? []}
      />
    </main>
  );
}
