import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import AbsenceClient from './AbsenceClient';

export const metadata: Metadata = { title: 'Absence Records' };

export default async function AbsencePage() {
  const supabase = createServerSupabaseClient();
  const { user, companyId } = await getSessionProfile();
  if (!user) return null;
  if (!companyId) return null;

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
