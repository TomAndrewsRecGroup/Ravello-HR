import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { ConsultationRecord } from '@/lib/hs/types';
import ConsultationClient from '@/components/hs/ConsultationClient';

export const metadata: Metadata = { title: 'Worker consultation' };
export const dynamic = 'force-dynamic';

export default async function ConsultationPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const records = await readAllPages<ConsultationRecord>((from, to) =>
    supabase.from('consultation_records')
      .select('id, company_id, site_id, consultation_date, topic, method, participants, outcome_summary, linked_action_id, created_by, created_at, updated_at')
      .eq('company_id', params.companyId)
      .order('consultation_date', { ascending: false }).order('id')
      .range(from, to));

  return (
    <ConsultationClient
      companyId={params.companyId}
      records={records.rows}
      loadError={records.error ?? (records.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
