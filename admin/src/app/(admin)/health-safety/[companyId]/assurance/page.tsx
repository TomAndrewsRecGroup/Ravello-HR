import Link from 'next/link';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadComplianceTwinSnapshot } from '@/lib/complianceTwin/loadSnapshot';
import { loadPortfolioCountsForCompany } from '@/lib/boardAssurance/loadPortfolioCounts';
import { assembleAssuranceToday } from '@/lib/assurance/today';
import AssuranceTodayView from '@/components/hs/AssuranceTodayView';

export const metadata: Metadata = { title: 'Assurance Today' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 18, Group 2. A composition of two ALREADY-BUILT
// loaders — loadPortfolioCountsForCompany() (Phase 13, the "right now"
// operational facts, one company scoped) and
// loadComplianceTwinSnapshot() (Phase 12, the slower-moving five-area
// picture) — combined by assembleAssuranceToday() (Group 1). No new
// query shape invented here at all.
export default async function AssuranceTodayPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ counts, loadError: countsError }, { snapshot: twin, loadError: twinError }] = await Promise.all([
    loadPortfolioCountsForCompany(supabase, params.companyId),
    loadComplianceTwinSnapshot(supabase, params.companyId),
  ]);

  const loadError = countsError ?? twinError ?? null;
  const snapshot = assembleAssuranceToday(counts, twin, new Date());

  const base = `/health-safety/${params.companyId}`;
  return (
    <>
      <div className="card p-3 mb-4 text-sm" style={{ color: 'var(--ink-faint)' }}>
        This is a detail view. <Link href={`${base}/core-360-status`} style={{ color: 'var(--purple)' }}>See Core 360 Status</Link> for the one overall verdict across People, Plant, Training, Risk Controls, Environmental and Contractors.
      </div>
      <AssuranceTodayView
        snapshot={snapshot}
        loadError={loadError}
        twinLinks={{
          safety: `${base}/kpis`,
          governance: `${base}/legal`,
          risk_graph: `${base}/risk-graph`,
          incident_patterns: `${base}/incident-patterns`,
          evidence: `${base}/evidence`,
        }}
      />
    </>
  );
}
