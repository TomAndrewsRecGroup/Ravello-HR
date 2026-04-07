import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import OnboardingClient from './OnboardingClient';

export const metadata: Metadata = { title: 'Onboarding' };
export const revalidate = 60;

export default async function OnboardingPage() {
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

  const [templatesRes, instancesRes, employeesRes] = await Promise.all([
    supabase
      .from('onboarding_templates')
      .select('id, name, description, is_default, created_at, onboarding_template_tasks(id, title, description, category, due_day_offset, assigned_to, sort_order)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('onboarding_instances')
      .select('*, employee_records(full_name, job_title, start_date), onboarding_task_progress(*)')
      .eq('company_id', companyId)
      .order('started_at', { ascending: false }),
    supabase
      .from('employee_records')
      .select('id, full_name, job_title, start_date')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('full_name'),
  ]);

  return (
    <main className="portal-page flex-1">
      <OnboardingClient
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
