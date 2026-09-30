import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadComplianceTwinSnapshot } from '@/lib/complianceTwin/loadSnapshot';
import ComplianceTwinView from '@/components/hs/ComplianceTwinView';

export const metadata: Metadata = { title: 'Digital Twin' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 12, Group 2. Assembles the client's Compliance
// Digital Twin (lib/complianceTwin/assemble.ts, Group 1) via
// loadComplianceTwinSnapshot() (lib/complianceTwin/loadSnapshot.ts,
// extracted in Phase 13 Group 2 so the board-assurance "generate"
// action calls the EXACT same assembly — one calculation, not two
// that could drift), which reads exactly the same rows each of the
// five source pages already reads — no new query shape invented.
export default async function DigitalTwinPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const { snapshot, loadError } = await loadComplianceTwinSnapshot(supabase, params.companyId);

  const base = `/health-safety/${params.companyId}`;
  return (
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
  );
}
