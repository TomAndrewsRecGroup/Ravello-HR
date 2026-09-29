import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { EnvironmentalComplaint } from '@/lib/hs/types';
import EnvironmentalComplaintsClient from '@/components/hs/EnvironmentalComplaintsClient';

export const metadata: Metadata = { title: 'Environmental complaints' };
export const dynamic = 'force-dynamic';

export default async function EnvironmentalComplaintsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const complaints = await readAllPages<EnvironmentalComplaint>((from, to) =>
    supabase.from('environmental_complaints')
      .select('id, company_id, site_id, received_at, source, description, investigated, outcome, linked_action_id, closed_at, created_by, created_at, updated_at')
      .eq('company_id', params.companyId)
      .order('received_at', { ascending: false }).order('id')
      .range(from, to));

  return (
    <EnvironmentalComplaintsClient
      companyId={params.companyId}
      complaints={complaints.rows}
      loadError={complaints.error ?? (complaints.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
