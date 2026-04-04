import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import OrgChartClient from './OrgChartClient';

export const metadata: Metadata = { title: 'Organisation Chart' };

export default async function OrgChartPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
  if (!companyId) return null;

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
