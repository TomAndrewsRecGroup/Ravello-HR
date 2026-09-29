import Link from 'next/link';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { ComplianceTwinSnapshot, ComplianceTwinBand, ComplianceTwinAreaKey } from '@/lib/complianceTwin/assemble';

// Core-OS 360 Phase 12, Group 2 (shared-dupe pair: admin and portal —
// both render the identical, already-assembled snapshot; only the
// per-area link targets differ, since admin's and portal's own route
// segments for the same underlying page genuinely diverge in one case
// (admin has a combined `/kpis` page; portal's closest equivalent is
// `/incidents`) and differ in spelling in another (`legal` vs.
// `legal-register`). Rather than guess a shared path suffix and risk a
// broken link in one app, each page supplies its OWN correct hrefs —
// this component only renders whatever href it is given per area, so
// it stays a true byte-identical shared-dupe file with no app-specific
// routing knowledge baked in.
//
// No interactivity beyond plain navigation links, so this is
// server-renderable in both apps — no 'use client' needed, the same
// call IncidentPatternsView.tsx already made.

const BAND_COLOUR: Record<ComplianceTwinBand, string> = {
  red: 'var(--red)',
  amber: 'var(--gold)',
  green: 'var(--teal)',
};

const BAND_LABEL: Record<ComplianceTwinBand, string> = {
  red: 'Needs attention',
  amber: 'Worth a look',
  green: 'On track',
};

function BandIcon({ band, size = 20 }: { band: ComplianceTwinBand; size?: number }) {
  const colour = BAND_COLOUR[band];
  if (band === 'red') return <XCircle size={size} style={{ color: colour, flexShrink: 0 }} />;
  if (band === 'amber') return <AlertTriangle size={size} style={{ color: colour, flexShrink: 0 }} />;
  return <CheckCircle2 size={size} style={{ color: colour, flexShrink: 0 }} />;
}

export default function ComplianceTwinView({
  snapshot, loadError, links,
}: {
  snapshot: ComplianceTwinSnapshot;
  loadError: string | null;
  /** One href per area, computed by the caller — see the header comment. */
  links: Record<ComplianceTwinAreaKey, string>;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        A single, read-time view across every EHS pillar, assembled from what this client&apos;s own
        register, risk graph, incident history and evidence coverage already show — never a prediction
        or a score, only what has already been recorded.
      </div>

      {loadError && (
        <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load the digital twin: {loadError}</p>
      )}

      {!loadError && (
        <>
          <div className="card p-4 flex items-center gap-3">
            <BandIcon band={snapshot.overallBand} size={28} />
            <div>
              <p className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                Overall: {BAND_LABEL[snapshot.overallBand]}
              </p>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                The worst of the five areas below — every area must be green for this to read green.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {snapshot.areas.map(area => (
              <section key={area.area} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BandIcon band={area.band} />
                    <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{area.label}</h2>
                  </div>
                  <Link href={links[area.area]} className="text-xs font-medium" style={{ color: 'var(--purple)' }}>
                    View details →
                  </Link>
                </div>
                <ul className="text-sm space-y-1">
                  {area.reasons.map((r, i) => (
                    <li key={i} style={{ color: area.band === 'green' ? 'var(--ink-faint)' : 'var(--ink-soft)' }}>
                      {r}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
