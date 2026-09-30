import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { portalUrl } from '@/lib/portalUrl';
import { loadCore360Status } from '@/lib/core360Status/loadStatus';
import Core360StatusView from '@/components/hs/Core360StatusView';

export const metadata: Metadata = { title: 'Core 360 Status' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Completion Programme, Phase 27, Group 4 (closes C13.8).
// A composition of already-built reads (loadCore360Status.ts, Group 4)
// — no new query shape invented here. People and Training have no
// admin-side page of their own (workforce and training records are
// managed only through the portal's PROTECT/LEAD workspace, staff
// included — the exact "Hazards and risk assessments have no
// admin-side per-record page" precedent Phase 8's own risk-graph page
// already established), so this links out to the portal for those two;
// Plant, Risk Controls, Environmental and Contractors all have a real
// admin tab already and link internally.
export default async function Core360StatusPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();
  const { snapshot, loadError } = await loadCore360Status(supabase, params.companyId);

  const base = `/health-safety/${params.companyId}`;
  const p = portalUrl();
  return (
    <Core360StatusView
      snapshot={snapshot}
      loadError={loadError}
      links={{
        people: `${p}/lead/workforce`,
        plant: `${base}/equipment`,
        training: `${p}/lead/training-records`,
        risk_controls: `${base}/risk-graph`,
        environmental: `${base}/environmental-spills`,
        contractors: `${base}/contractors`,
      }}
    />
  );
}
