import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AbsenceClient from './AbsenceClient';

export const metadata: Metadata = { title: 'Absence Records' };

export default async function AbsencePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = (profile as any)?.company_id;
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
