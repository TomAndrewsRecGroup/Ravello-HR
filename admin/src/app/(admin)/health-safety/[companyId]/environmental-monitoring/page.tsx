import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { EnvironmentalMonitoringReading } from '@/lib/hs/types';
import EnvironmentalMonitoringClient from '@/components/hs/EnvironmentalMonitoringClient';
import type { LinkedActionSummary } from '@/components/hs/LinkedActionBadge';

export const metadata: Metadata = { title: 'Environmental monitoring' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 2 (migration 157). within_limit is
// computed by the database ONLY when a limit is on file (GENERATED
// column) — this page never computes or infers it.
export default async function HealthSafetyEnvironmentalMonitoringPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const readings = await readAllPages<EnvironmentalMonitoringReading>((from, to) =>
    supabase.from('environmental_monitoring')
      .select('id, company_id, site_id, category, parameter, value, unit, recorded_limit, limit_direction, recorded_limit_upper, within_limit, recorded_at, recorded_by, created_at')
      .eq('company_id', params.companyId)
      .order('recorded_at', { ascending: false }).order('id')
      .range(from, to));

  // UI/UX cross-linking pass (2026-10-03): an exceedance raises a real
  // corrective action (environmentalRules.ts's own rule,
  // source_type='environmental_monitoring', source_id=the reading's
  // own id) that nothing here ever showed.
  const readingIds = readings.rows.map(r => r.id);
  const { data: linkedActions } = readingIds.length > 0
    ? await supabase.from('actions')
        .select('id, title, status, priority, due_date, verification_required, verified_at, source_id')
        .eq('company_id', params.companyId).eq('source_type', 'environmental_monitoring').in('source_id', readingIds).limit(500)
    : { data: [] as (LinkedActionSummary & { source_id: string })[] };

  return (
    <EnvironmentalMonitoringClient
      companyId={params.companyId}
      readings={readings.rows}
      linkedActions={(linkedActions ?? []) as (LinkedActionSummary & { source_id: string })[]}
      loadError={readings.error ?? (readings.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
