import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import EmployeeRecordsClient from './EmployeeRecordsClient';
import { normaliseAbsenceRows } from '@/lib/leaveCalculations';
import { EMPLOYEE_SAFE_COLUMNS, readEmployeePrivate, withPrivate } from '@/lib/lead/employeePrivate';

export const metadata: Metadata = { title: 'Employee Records' };
export const revalidate = 30;

export default async function EmployeeRecordsPage() {
  const supabase = await createServerSupabaseClient();
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

  const isAdmin = role === 'client_admin' || role === 'tps_admin';
  // Admin AND Editor can manage leave links — both can approve/deny
  // leave per the role spec, so both should be able to share the link.
  const canManageLeave = isAdmin || role === 'client_editor';

  // Salary, NI, DOB, diversity, address, emergency contacts, notes and the
  // leave token are not readable columns (131): they come from
  // employee_private_fields(), blanked unless the viewer may see them.
  const [empRes, leaveRes, priv, capsRes] = await Promise.all([
    supabase
      .from('employee_records')
      .select(EMPLOYEE_SAFE_COLUMNS)
      .eq('company_id', companyId)
      .order('full_name'),
    supabase
      .from('absence_records')
      .select('id,employee_id,employee_name,leave_type:absence_type,start_date,end_date,days_count:days,status')
      .eq('company_id', companyId)
      .order('start_date', { ascending: false }),
    readEmployeePrivate(supabase, companyId),
    supabase.rpc('my_capabilities'),
  ]);
  const caps = new Set<string>(Array.isArray(capsRes.data) ? (capsRes.data as string[]) : []);

  return (
    <main className="portal-page flex-1">
      <EmployeeRecordsClient
        companyId={companyId}
        userId={user.id}
        isAdmin={isAdmin}
        canManageLeave={canManageLeave}
        canReadHr={caps.has('hr.sensitive.read')}
        canWriteHr={caps.has('hr.sensitive.write')}
        initialEmployees={withPrivate((empRes.data ?? []) as unknown as { id: string }[], priv) as any}
        leaveRecords={normaliseAbsenceRows(leaveRes.data as any) as any}
      />
    </main>
  );
}
