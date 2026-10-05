import type { ComplianceTwinBand } from '@/lib/complianceTwin/assemble';

export interface SnapshotTrendRow {
  snapshot_date: string;
  overall_band: ComplianceTwinBand;
}

const BAND_COLOUR: Record<ComplianceTwinBand, string> = {
  red: 'var(--red)',
  amber: 'var(--gold)',
  green: 'var(--teal)',
};

function fmt(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Core-OS 360 Completion Programme, Phase 23, Group 4 (closes
// gap-ledger row C12.4). Admin-only — compliance_twin_snapshots is
// staff-only RLS, so there is no client-facing equivalent to mirror
// this into. A plain dot-per-day trend, newest last, most recent 30
// stored snapshots — never a formula or an extrapolation, just the
// stored history rendered as-is.
export default function SnapshotTrend({ snapshots }: { snapshots: SnapshotTrendRow[] }) {
  if (snapshots.length === 0) return null;
  const ordered = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  return (
    <section className="card p-4 space-y-2">
      <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
        Posture trend ({ordered.length} stored snapshot{ordered.length === 1 ? '' : 's'})
      </h2>
      <div className="flex items-end gap-2 overflow-x-auto pb-1">
        {ordered.map(s => (
          <div key={s.snapshot_date} className="flex flex-col items-center gap-1" title={`${fmt(s.snapshot_date)}: ${s.overall_band}`}>
            <span className="inline-block rounded-full" style={{ width: 16, height: 16, background: BAND_COLOUR[s.overall_band] }} />
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        {fmt(ordered[0].snapshot_date)} — {fmt(ordered[ordered.length - 1].snapshot_date)}. A stored fact per saved day, never recomputed after the fact.
      </p>
    </section>
  );
}
