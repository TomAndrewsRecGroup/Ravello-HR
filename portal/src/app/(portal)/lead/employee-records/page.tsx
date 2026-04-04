import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import EmployeeRecordsClient from './EmployeeRecordsClient';

export const metadata: Metadata = { title: 'Employee Records' };

export default async function EmployeeRecordsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id, role').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  const role = (profile as any)?.role;
  if (!companyId) return null;

  const isAdmin = role === 'client_admin' || role === 'ravello_admin' || role === 'ravello_recruiter';

  const { data: employees } = await supabase
    .from('employee_records')
    .select('*')
    .eq('company_id', companyId)
    .order('full_name');

  return (
    <main className="portal-page flex-1">
      <EmployeeRecordsClient
        companyId={companyId}
        userId={user.id}
        isAdmin={isAdmin}
        initialEmployees={employees ?? []}
      />
    </main>
  );
}
