import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { AssuranceTodaySnapshot, AssuranceBand } from '@/lib/assurance/today';
import type { ComplianceTwinAreaKey } from '@/lib/complianceTwin/assemble';
import ComplianceTwinView from './ComplianceTwinView';

// Core-OS 360 Phase 18, Group 2 (shared-dupe pair, the exact
// ComplianceTwinView precedent: both apps render the identical,
// already-assembled snapshot; only the per-area twin link targets
// differ, supplied by the caller). No interactivity beyond plain
// navigation links inside the embedded ComplianceTwinView, so this is
// server-renderable in both apps — no 'use client' needed.

const BAND_COLOUR: Record<AssuranceBand, string> = {
  urgent: 'var(--red)',
  attention: 'var(--gold)',
  clear: 'var(--teal)',
};

function BandIcon({ band, size = 28 }: { band: AssuranceBand; size?: number }) {
  const colour = BAND_COLOUR[band];
  if (band === 'urgent') return <XCircle size={size} style={{ color: colour, flexShrink: 0 }} />;
  if (band === 'attention') return <AlertTriangle size={size} style={{ color: colour, flexShrink: 0 }} />;
  return <CheckCircle2 size={size} style={{ color: colour, flexShrink: 0 }} />;
}

export default function AssuranceTodayView({
  snapshot, loadError, twinLinks,
}: {
  snapshot: AssuranceTodaySnapshot;
  loadError: string | null;
  /** One href per Digital Twin area, computed by the caller. */
  twinLinks: Record<ComplianceTwinAreaKey, string>;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        A single, dated view of what needs attention RIGHT NOW — workforce, assets, actions and
        governance — alongside the slower-moving Compliance Digital Twin picture below it. This is a
        count of what has already been recorded, never a certification: it never says "safe" or
        "compliant" on this organisation&apos;s behalf.
      </div>

      {loadError && (
        <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load today&apos;s assurance view: {loadError}</p>
      )}

      {!loadError && (
        <>
          <div className="card p-4 flex items-center gap-3">
            <BandIcon band={snapshot.band} />
            <div>
              <p className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>{snapshot.headline}</p>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                As of {new Date(snapshot.asOf).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          {snapshot.items.length > 0 && (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Flagged today</th><th>Count</th></tr></thead>
                <tbody>
                  {snapshot.items.map(item => (
                    <tr key={item.key}>
                      <td>{item.label}</td>
                      <td><span className="font-semibold" style={{ color: item.severity === 'high' ? 'var(--red)' : 'var(--gold)' }}>{item.count}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ComplianceTwinView snapshot={snapshot.twin} loadError={null} links={twinLinks} />
        </>
      )}
    </div>
  );
}
