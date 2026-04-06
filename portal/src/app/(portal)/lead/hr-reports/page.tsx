import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import HRReportsClient from './HRReportsClient';

export const metadata: Metadata = { title: 'HR Reports' };

export default async function HRReportsPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) return null;
  if (!companyId) return null;

  const [empRes, leaveRes] = await Promise.all([
    supabase
      .from('employee_records')
      .select('*')
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
