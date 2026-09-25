import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import TrainingRecordsClient from './TrainingRecordsClient';

export const metadata: Metadata = { title: 'Training Records' };
export const dynamic = 'force-dynamic';

export default async function TrainingRecordsPage() {
  const supabase = await createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
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

  const [{ data: records }, { data: employees }] = await Promise.all([
    supabase.from('training_records')
      .select('id, employee_id, course_name, provider, completed_on, expires_on, notes')
      .eq('company_id', companyId)
      .order('completed_on', { ascending: false }),
    supabase.from('employee_records')
      .select('id, full_name, email, department')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
  ]);

  return (
    <main className="portal-page flex-1">
      <TrainingRecordsClient companyId={companyId} initialRecords={records ?? []} employees={employees ?? []} />
    </main>
  );
}
