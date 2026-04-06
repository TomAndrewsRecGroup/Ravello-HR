import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import OffboardingClient from './OffboardingClient';

export const metadata: Metadata = { title: 'Offboarding' };

export default async function OffboardingPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId, role } = await getSessionProfile();
  if (!user) return null;
  if (!companyId) return null;

  const isAdmin = role === 'client_admin' || role === 'tps_admin' || role === 'tps_client';

  const [templatesRes, instancesRes, employeesRes] = await Promise.all([
    supabase
      .from('offboarding_templates')
      .select('id, name, description, created_at, offboarding_template_tasks(id, title, description, category, due_day_offset, sort_order)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('offboarding_instances')
      .select('*, employee_records(full_name, job_title), offboarding_task_progress(*)')
      .eq('company_id', companyId)
      .order('started_at', { ascending: false }),
    supabase
      .from('employee_records')
      .select('id, full_name, job_title')
      .eq('company_id', companyId)
      .in('status', ['active', 'on_leave'])
      .order('full_name'),
  ]);

  return (
    <main className="portal-page flex-1">
      <OffboardingClient
        companyId={companyId}
        userId={user.id}
        isAdmin={isAdmin}
        templates={templatesRes.data ?? []}
        instances={instancesRes.data ?? []}
        employees={employeesRes.data ?? []}
      />
    </main>
  );
}
