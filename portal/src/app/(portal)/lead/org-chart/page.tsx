import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import OrgChartClient from './OrgChartClient';

export const metadata: Metadata = { title: 'Organisation Chart' };
export const revalidate = 0;

export default async function OrgChartPage() {
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

  // Defensive self-seed: if a client_admin lands here with no employee
  // records yet (legacy clients converted before the BD modal started
  // seeding the contact), drop themselves on so they can start building
  // their team. Idempotent: only fires when the table is empty.
  if (role === 'client_admin') {
    const { count } = await supabase
      .from('employee_records')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);

    if ((count ?? 0) === 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.full_name) {
        await supabase.from('employee_records').insert({
          company_id:      companyId,
          full_name:       profile.full_name,
          email:           profile.email ?? null,
          job_title:       'Founder',
          department:      'Leadership',
          employment_type: 'full_time',
          status:          'active',
          start_date:      new Date().toISOString().split('T')[0],
        });
      }
    }
  }

  const { data: employees } = await supabase
    .from('employee_records')
    .select('id, full_name, job_title, department, line_manager, status, employment_type')
    .eq('company_id', companyId)
    .neq('status', 'terminated')
    .order('full_name');

  return (
    <main className="portal-page flex-1">
      <OrgChartClient
        employees={employees ?? []}
        canEdit={role === 'client_admin'}
        companyId={companyId}
      />
    </main>
  );
}
