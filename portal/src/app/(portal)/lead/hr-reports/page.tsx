import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import HRReportsClient from './HRReportsClient';

export const metadata: Metadata = { title: 'HR Reports' };

export default async function HRReportsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
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
