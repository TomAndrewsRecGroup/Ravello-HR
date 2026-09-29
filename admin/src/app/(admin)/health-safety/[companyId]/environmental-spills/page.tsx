import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { EnvironmentalSpill } from '@/lib/hs/types';
import EnvironmentalSpillsClient from '@/components/hs/EnvironmentalSpillsClient';

export const metadata: Metadata = { title: 'Environmental spills' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 2 (migration 157). A spill is its own
// table, optionally linked to an hs_incidents row (a spill serious
// enough to be a reportable incident); it never duplicates incident
// fields.
export default async function HealthSafetyEnvironmentalSpillsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const spills = await readAllPages<EnvironmentalSpill>((from, to) =>
    supabase.from('environmental_spills')
      .select('id, company_id, site_id, occurred_at, substance, estimated_volume, volume_unit, receiving_environment, contained, notified_authority, notified_at, hs_incident_id, status, created_by, created_at, updated_at')
      .eq('company_id', params.companyId)
      .order('occurred_at', { ascending: false }).order('id')
      .range(from, to));

  return (
    <EnvironmentalSpillsClient
      companyId={params.companyId}
      spills={spills.rows}
      loadError={spills.error ?? (spills.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
