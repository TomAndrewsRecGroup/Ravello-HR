import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadComplianceTwinSnapshot } from '@/lib/complianceTwin/loadSnapshot';
import ComplianceTwinView from '@/components/hs/ComplianceTwinView';
import SaveSnapshotButton from '@/components/hs/SaveSnapshotButton';
import SnapshotTrend, { type SnapshotTrendRow } from '@/components/hs/SnapshotTrend';
import ThresholdsForm, { type ThresholdsRow } from '@/components/hs/ThresholdsForm';

export const metadata: Metadata = { title: 'Digital Twin' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 12, Group 2, extended in Phase 23 Group 4 (closes
// C12.4). Assembles the client's Compliance Digital Twin
// (lib/complianceTwin/assemble.ts, Group 1) via
// loadComplianceTwinSnapshot() (lib/complianceTwin/loadSnapshot.ts,
// extracted in Phase 13 Group 2 so the board-assurance "generate"
// action calls the EXACT same assembly — one calculation, not two
// that could drift), which reads exactly the same rows each of the
// five source pages already reads — no new query shape invented.
//
// "Save today's snapshot" and the trend list are ADMIN ONLY —
// compliance_twin_snapshots (188) is staff-only RLS, an internal
// artefact of a staff action, the same posture management_review_
// data_pack/client_health_snapshots already take. The read here is
// under the same staff session already loading everything else on
// this page.
export default async function DigitalTwinPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ snapshot, loadError, thresholdsRow }, { data: snapshots }] = await Promise.all([
    loadComplianceTwinSnapshot(supabase, params.companyId),
    supabase.from('compliance_twin_snapshots').select('snapshot_date, overall_band')
      .eq('company_id', params.companyId).order('snapshot_date', { ascending: false }).limit(30),
  ]);

  const base = `/health-safety/${params.companyId}`;
  return (
    <div className="space-y-4">
      {!loadError && (
        <div className="flex justify-end">
          <SaveSnapshotButton companyId={params.companyId} snapshot={snapshot} />
        </div>
      )}
      <ComplianceTwinView
        snapshot={snapshot}
        loadError={loadError}
        links={{
          safety: `${base}/kpis`,
          governance: `${base}/legal`,
          risk_graph: `${base}/risk-graph`,
          incident_patterns: `${base}/incident-patterns`,
          evidence: `${base}/evidence`,
        }}
      />
      <SnapshotTrend snapshots={(snapshots ?? []) as SnapshotTrendRow[]} />
      <ThresholdsForm companyId={params.companyId} existing={thresholdsRow as unknown as ThresholdsRow | null} />
    </div>
  );
}
