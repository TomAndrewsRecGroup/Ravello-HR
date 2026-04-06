import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import OrgChartClient from './OrgChartClient';

export const metadata: Metadata = { title: 'Organisation Chart' };

export default async function OrgChartPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) return null;
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
