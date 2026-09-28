import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { HsIncident } from '@/lib/hs/types';
import IncidentsClient from '@/components/hs/IncidentsClient';

export const metadata: Metadata = { title: 'H&S incidents' };
export const dynamic = 'force-dynamic';

// RIDDOR record-keeping (112, extended by 125). This is the client's own legal duty;
// Core OS 360 maintains it on their behalf, so the client can read it
// (see hs_incidents_client_read) — staff record and investigate it.
export default async function HealthSafetyIncidentsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const incidents = await readAllPages<HsIncident>((from, to) =>
    supabase.from('hs_incidents')
      .select('id, company_id, incident_number, title, site_id, department_id, exact_location, incident_type, occurred_on, incident_time, description, activity_underway, immediate_actions, severity, severity_confirmed_by, severity_confirmed_at, investigation_required, riddor_review_status, riddor_reportable, riddor_reported_on, status, reported_by, reported_at, closed_at, close_override_reason, linked_risk_assessment_id, no_assessment_existed, linked_asset_id, row_version, created_at, updated_at')
      .eq('company_id', params.companyId)
      .order('occurred_on', { ascending: false }).order('id')
      .range(from, to));

  return (
    <IncidentsClient
      companyId={params.companyId}
      canRecord
      incidents={incidents.rows}
      loadError={incidents.error ?? (incidents.truncated ? 'Showing the first part of a long incident log.' : null)}
    />
  );
}
