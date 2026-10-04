import Link from 'next/link';
import { Hammer, Target, Network } from 'lucide-react';
import type { ContinuousImprovementSummary } from '@/lib/continuousImprovement/analyze';
import { MIN_WINDOW_DAYS, MAX_WINDOW_DAYS } from '@/lib/incidentPatterns/analyze';
import { MiniBarRow, CompareBars } from '@/components/charts/MiniCharts';

// Continuous Improvement (go-live gap list, item 8). Shared-dupe pair
// (admin and portal both read the identical, already-computed
// summary; only the window-picker base URL differs) — the exact
// `IncidentPatternsView.tsx` precedent. No interactivity beyond plain
// navigation links, so no 'use client' needed.
//
// "Are we getting better?" — reported entirely as counts and a
// period-over-period comparison, never a score or a trend LINE drawn
// from fewer than two real data points. No AI anywhere in this view.
export default function ContinuousImprovementView({
  windowDays, windows, summary, loadError, basePath,
}: {
  windowDays: number;
  windows: readonly number[];
  summary: ContinuousImprovementSummary;
  loadError: string | null;
  /** e.g. `/health-safety/<id>/continuous-improvement` (admin) or `/protect/continuous-improvement` (portal). */
  basePath: string;
}) {
  const { auditFindings, recurringRootCauses, objectives } = summary;

  return (
    <div className="space-y-4">
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        A period-over-period view of audit findings, recurring root causes and objective progress — what has
        already happened, compared across two equal windows, never a forecast.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {windows.map(w => (
          <Link key={w} href={`${basePath}?days=${w}`} className={w === windowDays ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'}>
            {w === 365 ? '1 year' : `${w} days`}
          </Link>
        ))}
        <form method="get" action={basePath} className="flex items-center gap-1.5">
          <input
            type="number"
            name="days"
            min={MIN_WINDOW_DAYS}
            max={MAX_WINDOW_DAYS}
            defaultValue={windowDays}
            aria-label={`Custom window, ${MIN_WINDOW_DAYS} to ${MAX_WINDOW_DAYS} days`}
            className="input btn-sm"
            style={{ width: 90 }}
          />
          <button type="submit" className="btn-secondary btn-sm">Apply</button>
        </form>
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Custom window: {MIN_WINDOW_DAYS}&ndash;{MAX_WINDOW_DAYS} days.
      </p>

      {loadError && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load data: {loadError}</p>}

      {!loadError && (
        <div className="space-y-4">
          <section className="card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Hammer size={16} style={{ color: 'var(--blue)' }} />
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Audit findings, this window vs. the one before</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-faint)' }}>Raised</p>
                <CompareBars currentLabel="This window" currentValue={auditFindings.currentWindow.raised} priorLabel="Previous" priorValue={auditFindings.priorWindow.raised} colour="var(--gold)" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-faint)' }}>Closed</p>
                <CompareBars currentLabel="This window" currentValue={auditFindings.currentWindow.closed} priorLabel="Previous" priorValue={auditFindings.priorWindow.closed} colour="var(--teal)" />
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              <strong style={{ color: 'var(--ink)' }}>{auditFindings.openNow}</strong> finding{auditFindings.openNow === 1 ? '' : 's'} open right now, regardless of window.
              {auditFindings.currentWindow.avgDaysToCloseClosed !== null && (
                <> Findings closed this window took, on average, <strong style={{ color: 'var(--ink)' }}>{auditFindings.currentWindow.avgDaysToCloseClosed}</strong> day{auditFindings.currentWindow.avgDaysToCloseClosed === 1 ? '' : 's'} to close.</>
              )}
            </p>
          </section>

          <section className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Network size={16} style={{ color: 'var(--gold)' }} />
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Recurring confirmed root causes</h2>
            </div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>A root-cause category confirmed on two or more separate incidents in this window.</p>
            {recurringRootCauses.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>None recorded in this window.</p>
            ) : (
              <div className="space-y-2">
                {recurringRootCauses.map(c => (
                  <MiniBarRow
                    key={c.category}
                    label={c.category.replace(/_/g, ' ')}
                    value={c.incidentCount}
                    max={Math.max(...recurringRootCauses.map(x => x.incidentCount), 1)}
                    colour="var(--gold)"
                  />
                ))}
              </div>
            )}
          </section>

          <section className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Target size={16} style={{ color: 'var(--teal)' }} />
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Objectives</h2>
            </div>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {objectives.healthyPercent === null ? (
                'No in-flight objectives (active, on track, at risk, achieved or missed) right now.'
              ) : (
                <>
                  <strong style={{ color: 'var(--ink)' }}>{objectives.healthyPercent}%</strong> of in-flight objectives are on track or achieved.
                </>
              )}
            </p>
            <div className="space-y-2">
              {(['active', 'on_track', 'at_risk', 'achieved', 'missed'] as const).map(s => (
                <MiniBarRow
                  key={s}
                  label={s.replace(/_/g, ' ')}
                  value={objectives.byStatus[s]}
                  max={Math.max(...(['active', 'on_track', 'at_risk', 'achieved', 'missed'] as const).map(x => objectives.byStatus[x]), 1)}
                  colour={s === 'at_risk' || s === 'missed' ? 'var(--red)' : s === 'achieved' ? 'var(--teal)' : 'var(--purple)'}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
