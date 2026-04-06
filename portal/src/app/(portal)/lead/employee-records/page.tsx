import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import EmployeeRecordsClient from './EmployeeRecordsClient';

export const metadata: Metadata = { title: 'Employee Records' };

export default async function EmployeeRecordsPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId, role } = await getSessionProfile();
  if (!user) return null;
  if (!companyId) return null;

  const isAdmin = role === 'client_admin' || role === 'tps_admin' || role === 'tps_client';

  const [empRes, leaveRes] = await Promise.all([
    supabase
      .from('employee_records')
      .select('*')
      .eq('company_id', companyId)
      .order('full_name'),
    supabase
      .from('leave_records')
      .select('*')
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
