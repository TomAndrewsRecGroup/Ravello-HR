import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import CalendarClient from './CalendarClient';

export const metadata: Metadata = { title: 'Company Calendar' };
export const revalidate = 30;

export default async function CalendarPage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId, role } = await getSessionProfile();
  if (!user) redirect('/auth/login');
  if (!companyId) return (
    <>
      <Topbar title="Company Calendar" subtitle="Track events, closures, and employee leave" />
      <main className="portal-page flex-1">
        <div className="card p-12 text-center">
          <div className="empty-state">
            <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>No company linked</p>
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>This page will populate once your company profile is set up.</p>
          </div>
        </div>
      </main>
    </>
  );

  const isAdmin = role === 'client_admin' || role === 'tps_admin' || role === 'tps_client';

  // Fetch calendar events and leave records for the current view range
  // (client will fetch more as user navigates months)
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  const yearEnd = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];

  const [eventsRes, leaveRes, employeesRes] = await Promise.all([
    supabase
      .from('company_calendar_events')
      .select('*')
      .eq('company_id', companyId)
      .gte('end_date', yearStart)
      .lte('start_date', yearEnd)
      .order('start_date'),
    supabase
      .from('leave_records')
      .select('*, employee_records(full_name, job_title)')
      .eq('company_id', companyId)
      .gte('end_date', yearStart)
      .lte('start_date', yearEnd)
      .order('start_date'),
    supabase
      .from('employee_records')
      .select('id, full_name, job_title')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('full_name'),
  ]);

  return (
    <>
      <Topbar title="Company Calendar" subtitle="Track events, closures, and employee leave" />
      <main className="portal-page flex-1">
        <CalendarClient
          companyId={companyId}
          isAdmin={isAdmin}
          initialEvents={eventsRes.data ?? []}
          initialLeave={leaveRes.data ?? []}
          employees={employeesRes.data ?? []}
        />
      </main>
    </>
  );
}
