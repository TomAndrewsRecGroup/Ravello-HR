import Link from 'next/link';
import { AlertTriangle, Building2, Network, TrendingUp } from 'lucide-react';
import type { IncidentPatternSummary } from '@/lib/incidentPatterns/analyze';
import { MIN_WINDOW_DAYS, MAX_WINDOW_DAYS } from '@/lib/incidentPatterns/analyze';

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

          <section className="card p-4 space-y-2">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>By type</h2>
            <ul className="text-sm space-y-1">
              {summary.byType.map(t => (
                <li key={t.incidentType} className="flex items-center justify-between">
                  <span style={{ color: 'var(--ink-soft)' }}>{t.incidentType.replace(/_/g, ' ')}</span>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{t.count}</span>
                </li>
              ))}
            </ul>
          </section>

          {summary.recurringRootCauses.length > 0 && (
            <section className="card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Network size={16} style={{ color: 'var(--gold)' }} />
                <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Recurring confirmed root causes</h2>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>A root-cause category confirmed on two or more separate incidents in this window.</p>
              <ul className="text-sm space-y-1">
                {summary.recurringRootCauses.map(c => (
                  <li key={c.category} className="flex items-center justify-between">
                    <span style={{ color: 'var(--ink-soft)' }}>{c.category.replace(/_/g, ' ')}</span>
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{c.incidentCount} incidents</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(summary.siteClusters.length > 0 || summary.departmentClusters.length > 0) && (
            <section className="card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Building2 size={16} style={{ color: 'var(--gold)' }} />
                <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Recorded concentrations</h2>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Two or more incidents at the same site or department in this window — a count of what has happened, not a risk rating.</p>
              <ul className="text-sm space-y-1">
                {summary.siteClusters.map(c => (
                  <li key={`site:${c.id}`} className="flex items-center justify-between">
                    <span style={{ color: 'var(--ink-soft)' }}>{siteNames[c.id] ?? 'Unnamed site'}</span>
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{c.count} incidents</span>
                  </li>
                ))}
                {summary.departmentClusters.map(c => (
                  <li key={`dept:${c.id}`} className="flex items-center justify-between">
                    <span style={{ color: 'var(--ink-soft)' }}>{deptNames[c.id] ?? 'Unnamed department'}</span>
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{c.count} incidents</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: 'var(--blue)' }} />
              <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Severity, this window vs. the one before</h2>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th></th><th>Major</th><th>Critical</th><th>Fatal</th></tr></thead>
                <tbody>
                  <tr><td style={{ color: 'var(--ink-soft)' }}>This window</td><td>{summary.severityComparison.currentWindow.major}</td><td>{summary.severityComparison.currentWindow.critical}</td><td>{summary.severityComparison.currentWindow.fatal}</td></tr>
                  <tr><td style={{ color: 'var(--ink-soft)' }}>Previous window</td><td>{summary.severityComparison.priorWindow.major}</td><td>{summary.severityComparison.priorWindow.critical}</td><td>{summary.severityComparison.priorWindow.fatal}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
