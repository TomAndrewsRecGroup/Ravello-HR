import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { portalUrl } from '@/lib/portalUrl';
import { loadCore360Status } from '@/lib/core360Status/loadStatus';
import { loadComplianceTwinSnapshot } from '@/lib/complianceTwin/loadSnapshot';
import { loadPortfolioCountsForCompany } from '@/lib/boardAssurance/loadPortfolioCounts';
import { assembleAssuranceToday } from '@/lib/assurance/today';
import Core360StatusView from '@/components/hs/Core360StatusView';
import AssuranceTodayView from '@/components/hs/AssuranceTodayView';
import SaveSnapshotButton from '@/components/hs/SaveSnapshotButton';
import SnapshotTrend, { type SnapshotTrendRow } from '@/components/hs/SnapshotTrend';
import ThresholdsForm, { type ThresholdsRow } from '@/components/hs/ThresholdsForm';
import BoardAssuranceClient, { type BoardAssuranceReportRow } from '@/components/hs/BoardAssuranceClient';
import type { BoardAssuranceReportData } from '@/lib/boardAssurance/computeReport';

export const metadata: Metadata = { title: 'Core 360 Status' };
export const dynamic = 'force-dynamic';

// Go-live gap list, item 3 (2026-10-02): "keep only one" dashboard —
// this page is now that one. It used to be four separate pages
// (Digital Twin, Assurance Today, Board Assurance, Core 360 Status
// itself), each answering some version of "is this client OK" with no
// cross-link between them; a client or a staff member could read "On
// track" on one and "At risk" on another with no indication why. All
// four are now sections on ONE page, each computed by the EXACT
// already-built loader its own standalone page used — no new query
// shape invented anywhere in this merge, only the assembly of what
// already existed. /digital-twin, /assurance and /board-assurance now
// redirect here (see their own page.tsx files).
//
// Section order, deliberately: the six-domain Core 360 Status overview
// first (the plain-English "is this client OK" verdict this whole
// consolidation is named after), then the slower-moving EHS Posture
// detail (Assurance Today, which already embeds the five-area
// Compliance Digital Twin — one component, not two stacked), then the
// admin-only snapshot/threshold tools, then Board Assurance's own
// quarterly report workflow last, since generating/issuing a report is
// a deliberate staff action, not something read passively on page load.
export default async function Core360StatusPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [
    { snapshot, loadError },
    { counts, loadError: countsError },
    { snapshot: twin, loadError: twinError, thresholdsRow },
    { data: snapshotsRaw },
    { data: company },
    { data: reportsRaw, error: reportsError },
  ] = await Promise.all([
    loadCore360Status(supabase, params.companyId),
    loadPortfolioCountsForCompany(supabase, params.companyId),
    loadComplianceTwinSnapshot(supabase, params.companyId),
    supabase.from('compliance_twin_snapshots').select('snapshot_date, overall_band')
      .eq('company_id', params.companyId).order('snapshot_date', { ascending: false }).limit(30),
    supabase.from('companies').select('name').eq('id', params.companyId).single(),
    supabase.from('board_assurance_reports')
      .select('id, year, quarter, status, report_data, issued_at')
      .eq('company_id', params.companyId)
      .order('year', { ascending: false }).order('quarter', { ascending: false })
      .limit(40),
  ]);

  const assuranceError = countsError ?? twinError ?? null;
  const assuranceSnapshot = assembleAssuranceToday(counts, twin, new Date());

  const reportIds = (reportsRaw ?? []).map(r => r.id as string);
  const { data: acks } = reportIds.length > 0
    ? await supabase.from('board_assurance_acknowledgements').select('report_id').in('report_id', reportIds)
    : { data: [] as { report_id: string }[] };
  const ackCounts = new Map<string, number>();
  for (const a of acks ?? []) ackCounts.set(a.report_id, (ackCounts.get(a.report_id) ?? 0) + 1);

  const reportRows: BoardAssuranceReportRow[] = (reportsRaw ?? []).map(r => ({
    id: r.id as string,
    year: r.year as number,
    quarter: r.quarter as number,
    status: r.status as 'draft' | 'issued',
    issuedAt: r.issued_at as string | null,
    data: r.report_data as BoardAssuranceReportData,
    acknowledgementCount: ackCounts.get(r.id as string) ?? 0,
  }));

  const base = `/health-safety/${params.companyId}`;
  const p = portalUrl();

  return (
    <div className="space-y-6">
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

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--ink)' }}>EHS Posture — Right Now</h2>
        {!assuranceError && (
          <div className="flex justify-end">
            <SaveSnapshotButton companyId={params.companyId} snapshot={twin} />
          </div>
        )}
        <AssuranceTodayView
          snapshot={assuranceSnapshot}
          loadError={assuranceError}
          twinLinks={{
            safety: `${base}/kpis`,
            governance: `${base}/legal`,
            risk_graph: `${base}/risk-graph`,
            incident_patterns: `${base}/incident-patterns`,
            evidence: `${base}/evidence`,
          }}
        />
        <SnapshotTrend snapshots={(snapshotsRaw ?? []) as SnapshotTrendRow[]} />
        <ThresholdsForm companyId={params.companyId} existing={thresholdsRow as unknown as ThresholdsRow | null} />
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--ink)' }}>Board Assurance</h2>
        <BoardAssuranceClient
          companyId={params.companyId}
          companyName={company?.name ?? 'This client'}
          reports={reportRows}
          loadError={reportsError?.message ?? null}
        />
      </section>
    </div>
  );
}
