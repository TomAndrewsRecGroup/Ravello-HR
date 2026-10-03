import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { EnvironmentalSpill } from '@/lib/hs/types';
import EnvironmentalSpillsClient from '@/components/hs/EnvironmentalSpillsClient';
import type { LinkedActionSummary } from '@/components/hs/LinkedActionBadge';

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

  // UI/UX cross-linking pass (2026-10-03): an uncontained spill raises
  // a real corrective action (environmentalRules.ts's own rule,
  // source_type='environmental_spill', source_id=the spill's own id)
  // that nothing here ever showed.
  const spillIds = spills.rows.map(s => s.id);
  const { data: linkedActions } = spillIds.length > 0
    ? await supabase.from('actions')
        .select('id, title, status, priority, due_date, verification_required, verified_at, source_id')
        .eq('company_id', params.companyId).eq('source_type', 'environmental_spill').in('source_id', spillIds).limit(500)
    : { data: [] as (LinkedActionSummary & { source_id: string })[] };

  return (
    <EnvironmentalSpillsClient
      companyId={params.companyId}
      spills={spills.rows}
      linkedActions={(linkedActions ?? []) as (LinkedActionSummary & { source_id: string })[]}
      loadError={spills.error ?? (spills.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
