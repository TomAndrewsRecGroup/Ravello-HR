import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import CalendarClient from './CalendarClient';
import { normaliseAbsenceRows } from '@/lib/leaveCalculations';

export const metadata: Metadata = { title: 'Company Calendar' };
export const revalidate = 30;

export default async function CalendarPage() {
  const supabase = await createServerSupabaseClient();
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

  const isAdmin = role === 'client_admin' || role === 'tps_admin';

  // Fetch calendar events and leave records for the current view range
  // (client will fetch more as user navigates months)
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  const yearEnd = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];

  const [eventsRes, leaveRes, employeesRes] = await Promise.all([
    supabase
      .from('company_calendar_events')
      .select('id,title,event_type,start_date,end_date,all_day,start_time,end_time,recurring_yearly,notes')
      .eq('company_id', companyId)
      .gte('end_date', yearStart)
      .lte('start_date', yearEnd)
      .order('start_date'),
    supabase
      .from('absence_records')
      .select('id,employee_id,employee_name,leave_type:absence_type,start_date,end_date,days_count:days,status,notes,employee_records(full_name, job_title)')
      .eq('company_id', companyId)
      // end_date may be blank (single-day absence), so a row counts as
      // in range when it ends in range OR has no end and starts in range.
      .or(`end_date.gte.${yearStart},and(end_date.is.null,start_date.gte.${yearStart})`)
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
          initialLeave={normaliseAbsenceRows(leaveRes.data as any) as any}
          employees={employeesRes.data ?? []}
        />
      </main>
    </>
  );
}
