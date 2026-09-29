import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { EnvironmentalPermit, PermitCondition } from '@/lib/hs/types';
import EnvironmentalPermitsClient from '@/components/hs/EnvironmentalPermitsClient';

export const metadata: Metadata = { title: 'Environmental permits' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 2 (migration 157). A regulator's ongoing
// licence to operate — a different concept from H&S's permit TO WORK
// (152), a time-bounded authorisation for one job.
export default async function HealthSafetyEnvironmentalPermitsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const permits = await readAllPages<EnvironmentalPermit>((from, to) =>
    supabase.from('environmental_permits')
      .select('id, company_id, site_id, permit_type, permit_number, issuing_authority, issued_on, expires_on, status, created_by, created_at, updated_at')
      .eq('company_id', params.companyId).order('permit_type').order('id').range(from, to));

  const permitIds = permits.rows.map(p => p.id);
  const { data: conditions, error: condError } = permitIds.length > 0
    ? await supabase.from('permit_conditions')
        .select('id, environmental_permit_id, company_id, condition_text, review_frequency, next_review_due, status, last_evidence_at, created_by, created_at, updated_at')
        .in('environmental_permit_id', permitIds).order('next_review_due')
    : { data: [] as PermitCondition[], error: null };

  return (
    <EnvironmentalPermitsClient
      companyId={params.companyId}
      permits={permits.rows}
      conditions={(conditions ?? []) as PermitCondition[]}
      loadError={permits.error ?? condError?.message ?? null}
    />
  );
}
