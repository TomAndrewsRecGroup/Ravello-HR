import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import AbsenceClient from './AbsenceClient';

export const metadata: Metadata = { title: 'Absence Records' };
export const revalidate = 30;

export default async function AbsencePage() {
  const supabase = createServerSupabaseClient();
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

  const { data: records } = await supabase
    .from('absence_records')
    .select('*')
    .eq('company_id', companyId)
    .order('start_date', { ascending: false });

  return (
      <main className="portal-page flex-1">
        <AbsenceClient companyId={companyId} initialRecords={records ?? []} />
      </main>
  );
}
