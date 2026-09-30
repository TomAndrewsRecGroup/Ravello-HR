import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { EnvironmentalMonitoringReading } from '@/lib/hs/types';
import EnvironmentalMonitoringClient from '@/components/hs/EnvironmentalMonitoringClient';

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

  return (
    <EnvironmentalMonitoringClient
      companyId={params.companyId}
      readings={readings.rows}
      loadError={readings.error ?? (readings.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
