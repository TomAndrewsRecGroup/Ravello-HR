import Link from 'next/link';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { Core360StatusSnapshot, Core360Band, Core360DomainKey } from '@/lib/core360Status/assemble';
import { BandRing } from '@/components/charts/MiniCharts';

// Core-OS 360 Completion Programme, Phase 27, Group 4 (closes C13.8).
// A shared-dupe pair, the exact ComplianceTwinView/AssuranceTodayView
// precedent: both apps render the identical, already-assembled
// snapshot; only the per-domain link targets differ, supplied by the
// caller, since admin's and portal's own route segments for the same
// underlying page genuinely diverge. No interactivity beyond plain
// navigation links, so this is server-renderable in both apps — no
// 'use client' needed.

const BAND_COLOUR: Record<Core360Band, string> = {
  critical: 'var(--red)',
  attention: 'var(--gold)',
  ok: 'var(--teal)',
};

const BAND_LABEL: Record<Core360Band, string> = {
  critical: 'Critical',
  attention: 'Attention',
  ok: 'OK',
};

function humaniseKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function BandIcon({ band, size = 20 }: { band: Core360Band; size?: number }) {
  const colour = BAND_COLOUR[band];
  if (band === 'critical') return <XCircle size={size} style={{ color: colour, flexShrink: 0 }} />;
  if (band === 'attention') return <AlertTriangle size={size} style={{ color: colour, flexShrink: 0 }} />;
  return <CheckCircle2 size={size} style={{ color: colour, flexShrink: 0 }} />;
}

export default function Core360StatusView({
  snapshot, loadError, links,
}: {
  snapshot: Core360StatusSnapshot;
  loadError: string | null;
  /** One href per domain, computed by the caller — see the header comment. */
  links: Record<Core360DomainKey, string>;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        People, Plant, Training, Risk Controls, Environmental and Contractors — six named domains,
        each a fixed, named-threshold reading of what this client&apos;s own records already show.
        Never a prediction or a score, only what has already been recorded.
      </div>

      {loadError && (
        <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load Core 360 Status: {loadError}</p>
      )}

      {!loadError && (
        <>
          <div className="card p-4 flex items-center gap-4">
            <BandRing
              segments={snapshot.domains.map(d => ({ band: d.band }))}
              centreLabel={BAND_LABEL[snapshot.overallBand]}
              centreSub={`${snapshot.domains.length} domains`}
            />
            <div>
              <p className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <BandIcon band={snapshot.overallBand} size={20} /> Overall: {BAND_LABEL[snapshot.overallBand]}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                The worst of the six domains below — every domain must be OK for this to read OK.
                Each ring segment is one domain, coloured the same way its own card is below.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {snapshot.domains.map(domain => (
              <section key={domain.domain} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BandIcon band={domain.band} />
                    <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{domain.label}</h2>
                  </div>
                  <Link href={links[domain.domain]} className="text-xs font-medium" style={{ color: 'var(--purple)' }}>
                    View details →
                  </Link>
                </div>
                <ul className="text-sm space-y-1">
                  {domain.reasons.map((r, i) => (
                    <li key={i} style={{ color: domain.band === 'ok' ? 'var(--ink-faint)' : 'var(--ink-soft)' }}>
                      {r}
                    </li>
                  ))}
                </ul>
                {Object.keys(domain.inputs).length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer select-none" style={{ color: 'var(--ink-faint)' }}>Show inputs</summary>
                    <ul className="mt-1 space-y-0.5">
                      {Object.entries(domain.inputs).map(([k, v]) => (
                        <li key={k} className="flex justify-between gap-2" style={{ color: 'var(--ink-faint)' }}>
                          <span>{humaniseKey(k)}</span>
                          <span className="font-mono">{v === null ? '—' : String(v)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
