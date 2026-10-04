import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePortfolioSession } from '@/lib/consultancy/portfolioAccess';
import { loadConsultantMetrics } from '@/lib/consultancy/loadConsultantMetrics';
import { OBSERVATION_TYPE_LABELS, OBSERVATION_TYPES } from '@/lib/consultancy/vocab';
import { MiniBarRow, ProportionBar } from '@/components/charts/MiniCharts';

export const metadata: Metadata = { title: 'Consultant Metrics' };
export const dynamic = 'force-dynamic';

const PERIOD_DAYS = 90;

// Core-OS 360 Phase 7, Group 6 ("Consultant Metrics"). Factual
// aggregation over the trailing 90 days across the caller's own
// portfolio — no score, no AI, nothing predicted, the same posture
// lib/health/scoring.ts and lib/hs/kpis.ts already take.
export default async function ConsultantMetricsPage() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');

  const today = new Date();
  const from = new Date(today.getTime() - PERIOD_DAYS * 86_400_000).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  const m = await loadConsultantMetrics(portfolio, { from, to });

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const followUpTotal = m.followUpsBooked + m.followUpsOutstanding;
  const followUpPct = followUpTotal > 0 ? Math.round((m.followUpsBooked / followUpTotal) * 100) : null;

  const CardCount = ({ label, n }: { label: string; n: number | string }) => (
    <div className="card p-4">
      <p className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{n}</p>
      <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{label}</p>
    </div>
  );

  return (
    <main className="portal-page flex-1 space-y-4">
      <div>
        <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Consultant Metrics</h1>
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{fmt(from)} – {fmt(to)}, across {portfolio.organisations.length} authorised client{portfolio.organisations.length === 1 ? '' : 's'}</p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <CardCount label="Visits completed" n={m.visitsCompleted} />
        <CardCount label="Reports issued" n={m.reportsIssued} />
        <CardCount label="Avg days: visit → report" n={m.avgDaysVisitToReportIssued ?? '—'} />
        <CardCount label="Observations recorded" n={m.observationsRecorded} />
        <CardCount label="Actions raised" n={m.actionsRaised} />
        <CardCount label="Actions closed" n={m.actionsClosed} />
        <CardCount label="Follow-up visits booked" n={followUpPct !== null ? `${followUpPct}%` : '—'} />
      </div>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Observations by type</h2>
        {m.observationsRecorded === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None recorded in this period.</p>
        ) : (
          <div className="space-y-2">
            {OBSERVATION_TYPES.filter(t => (m.observationsByType[t] ?? 0) > 0).map(t => (
              <MiniBarRow
                key={t}
                label={OBSERVATION_TYPE_LABELS[t]}
                value={m.observationsByType[t] ?? 0}
                max={Math.max(...OBSERVATION_TYPES.map(x => m.observationsByType[x] ?? 0), 1)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Follow-up compliance</h2>
        {followUpTotal === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>No issued reports have recommended a follow-up visit.</p>
        ) : (
          <ProportionBar segments={[
            { value: m.followUpsBooked, colour: 'var(--teal)', label: 'Booked' },
            { value: m.followUpsOutstanding, colour: 'var(--gold)', label: 'Outstanding' },
          ]} />
        )}
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Not period-scoped — a recommendation is outstanding until a follow-up visit is booked, however long ago it was made.</p>
      </section>
    </main>
  );
}
