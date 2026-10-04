import Link from 'next/link';
import { AlertTriangle, Building2, Network, TrendingUp } from 'lucide-react';
import type { IncidentPatternSummary } from '@/lib/incidentPatterns/analyze';
import { MIN_WINDOW_DAYS, MAX_WINDOW_DAYS } from '@/lib/incidentPatterns/analyze';
import { MiniBarRow, CompareBars } from '@/components/charts/MiniCharts';

// Core-OS 360 Phase 10, Group 2 (shared-dupe pair: admin and portal —
// both read the identical, already-computed summary; only the base
// URL for the window-picker links differs). No interactivity beyond
// plain navigation links, so this is a server-renderable component in
// both apps — no 'use client' needed.
//
// Historical, factual counts only — see lib/incidentPatterns/
// analyze.ts's own header for the rule this whole page exists to
// honour: never a risk score, never a prediction.
export default function IncidentPatternsView({
  windowDays, windows, summary, siteNames, deptNames, loadError, basePath,
}: {
  windowDays: number;
  windows: readonly number[];
  summary: IncidentPatternSummary;
  siteNames: Record<string, string>;
  deptNames: Record<string, string>;
  loadError: string | null;
  /** e.g. `/health-safety/<id>/incident-patterns` (admin) or `/protect/incident-patterns` (portal). */
  basePath: string;
}) {
  const empty = summary.totalIncidents === 0;

  return (
    <div className="space-y-4">
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Recorded patterns from the last {windowDays} days — what has already happened, never a forecast or a risk
        rating.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {windows.map(w => (
          <Link
            key={w}
            href={`${basePath}?days=${w}`}
            className={w === windowDays ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'}
          >
            {w === 365 ? '1 year' : `${w} days`}
          </Link>
        ))}
        {/* Core-OS 360 Completion Programme, Phase 25, Group 3 (C10.4):
            a plain GET form — no JavaScript needed, the same native-
            navigation discipline every preset link above already uses.
            The page itself clamps to [MIN_WINDOW_DAYS, MAX_WINDOW_DAYS]
            regardless of what this sends, so this is a convenience, not
            the real bound. */}
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

      {loadError && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load incident data: {loadError}</p>}

      {!loadError && empty && (
        <div className="card empty-state p-10">
          <AlertTriangle size={24} style={{ color: 'var(--ink-faint)' }} />
          <p style={{ color: 'var(--ink-faint)' }}>No incidents recorded in this window.</p>
        </div>
      )}

      {!loadError && !empty && (
        <div className="space-y-4">
          <div className="card p-4">
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              <strong style={{ color: 'var(--ink)' }}>{summary.totalIncidents}</strong> incident{summary.totalIncidents === 1 ? '' : 's'} recorded
            </p>
          </div>

          <section className="card p-4 space-y-3">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>By type</h2>
            <div className="space-y-2">
              {summary.byType.map(t => (
                <MiniBarRow
                  key={t.incidentType}
                  label={t.incidentType.replace(/_/g, ' ')}
                  value={t.count}
                  max={Math.max(...summary.byType.map(x => x.count), 1)}
                />
              ))}
            </div>
          </section>

          {summary.recurringRootCauses.length > 0 && (
            <section className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Network size={16} style={{ color: 'var(--gold)' }} />
                <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Recurring confirmed root causes</h2>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>A root-cause category confirmed on two or more separate incidents in this window.</p>
              <div className="space-y-2">
                {summary.recurringRootCauses.map(c => (
                  <MiniBarRow
                    key={c.category}
                    label={c.category.replace(/_/g, ' ')}
                    value={c.incidentCount}
                    max={Math.max(...summary.recurringRootCauses.map(x => x.incidentCount), 1)}
                    colour="var(--gold)"
                    display={`${c.incidentCount}`}
                  />
                ))}
              </div>
            </section>
          )}

          {(summary.siteClusters.length > 0 || summary.departmentClusters.length > 0) && (
            <section className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Building2 size={16} style={{ color: 'var(--gold)' }} />
                <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Recorded concentrations</h2>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Two or more incidents at the same site or department in this window — a count of what has happened, not a risk rating.</p>
              <div className="space-y-2">
                {(() => {
                  const maxCluster = Math.max(
                    ...summary.siteClusters.map(c => c.count),
                    ...summary.departmentClusters.map(c => c.count),
                    1,
                  );
                  return (
                    <>
                      {summary.siteClusters.map(c => (
                        <MiniBarRow key={`site:${c.id}`} label={siteNames[c.id] ?? 'Unnamed site'} value={c.count} max={maxCluster} colour="var(--gold)" />
                      ))}
                      {summary.departmentClusters.map(c => (
                        <MiniBarRow key={`dept:${c.id}`} label={deptNames[c.id] ?? 'Unnamed department'} value={c.count} max={maxCluster} colour="var(--gold)" />
                      ))}
                    </>
                  );
                })()}
              </div>
            </section>
          )}

          <section className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: 'var(--blue)' }} />
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Severity, this window vs. the one before</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(['major', 'critical', 'fatal'] as const).map(tier => {
                const cur = summary.severityComparison.currentWindow[tier];
                const prior = summary.severityComparison.priorWindow[tier];
                return (
                  <div key={tier}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-faint)' }}>
                      {tier}
                    </p>
                    <CompareBars
                      currentLabel="This window" currentValue={cur}
                      priorLabel="Previous" priorValue={prior}
                      colour={tier === 'fatal' ? 'var(--red)' : tier === 'critical' ? 'var(--gold)' : 'var(--blue)'}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
