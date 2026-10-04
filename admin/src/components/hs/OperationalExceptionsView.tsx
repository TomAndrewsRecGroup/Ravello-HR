import Link from 'next/link';
import { AlertOctagon } from 'lucide-react';
import {
  PERSON_EXCEPTION_SIGNAL_LABELS, ASSET_EXCEPTION_SIGNAL_LABELS,
  type OperationalExceptionsSummary, type PersonException, type AssetException,
} from '@/lib/operationalExceptions/analyze';
import { MiniBarRow } from '@/components/charts/MiniCharts';

// Operational Exception Detection (go-live gap list, item 10). A
// shared-dupe pair, the ComplianceTwinView/Core360StatusView
// precedent: both apps render the identical, already-computed
// summary; only the per-record link targets differ, supplied by the
// caller (admin has no person profile page of its own — see the
// header comment on the admin page — so personHref is optional
// there). No interactivity beyond plain navigation links, so no
// 'use client' needed.
//
// Deliberately NOT a severity score or a ranked list beyond "2
// signals vs. 3+" — the input is already sorted by signal count, and
// that count is shown verbatim, never translated into a colour band
// or a percentage. No AI anywhere in this view.
function Row({ label, signals, signalLabels, href }: {
  label: string; signals: readonly string[]; signalLabels: Record<string, string>; href?: string;
}) {
  return (
    <tr>
      <td>{href ? <Link href={href} className="font-medium" style={{ color: 'var(--purple)' }}>{label}</Link> : <span className="font-medium">{label}</span>}</td>
      <td>
        <span className="badge badge-high">{signals.length} signals</span>
      </td>
      <td>
        <ul className="text-xs space-y-0.5" style={{ color: 'var(--ink-soft)' }}>
          {signals.map(s => <li key={s}>{signalLabels[s] ?? s}</li>)}
        </ul>
      </td>
    </tr>
  );
}

export default function OperationalExceptionsView({
  summary, loadError, personHref, assetHref,
}: {
  summary: OperationalExceptionsSummary;
  loadError: string | null;
  /** Resolves one person's own detail page — omitted (never rendered as a link) where no such page exists. */
  personHref?: (personId: string) => string;
  /** Resolves one asset's own detail/management page. */
  assetHref?: (assetId: string) => string;
}) {
  const { personExceptions, assetExceptions } = summary;

  return (
    <div className="space-y-4">
      <div className="card p-4 text-sm flex items-start gap-2" style={{ color: 'var(--ink-soft)' }}>
        <AlertOctagon size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }} />
        <span>
          A person or asset where two or more independent, already-recorded facts are true
          RIGHT NOW — never a prediction, never a score, never a model. A single flagged item
          alone is routine and already shown on its own page; what matters here is the SAME
          record carrying more than one problem at the same time.
        </span>
      </div>

      {loadError && <p className="card p-4 text-sm" style={{ color: 'var(--red)' }}>Could not load data: {loadError}</p>}

      {!loadError && (personExceptions.length > 0 || assetExceptions.length > 0) && (
        <div className="card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Where exceptions concentrate</p>
          <MiniBarRow label="People" value={personExceptions.length} max={Math.max(personExceptions.length, assetExceptions.length, 1)} colour="var(--gold)" />
          <MiniBarRow label="Assets" value={assetExceptions.length} max={Math.max(personExceptions.length, assetExceptions.length, 1)} colour="var(--gold)" />
        </div>
      )}

      {!loadError && (
        <div className="space-y-4">
          <section className="card p-4 space-y-2">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>People ({personExceptions.length})</h2>
            {personExceptions.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No one currently carries two or more of these signals at once.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Person</th><th></th><th>Signals</th></tr></thead>
                  <tbody>
                    {personExceptions.map((e: PersonException) => (
                      <Row key={e.personId} label={e.label} signals={e.signals} signalLabels={PERSON_EXCEPTION_SIGNAL_LABELS}
                        href={personHref?.(e.personId)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card p-4 space-y-2">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Assets ({assetExceptions.length})</h2>
            {assetExceptions.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No asset currently carries two or more of these signals at once.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Asset</th><th></th><th>Signals</th></tr></thead>
                  <tbody>
                    {assetExceptions.map((e: AssetException) => (
                      <Row key={e.assetId} label={e.label} signals={e.signals} signalLabels={ASSET_EXCEPTION_SIGNAL_LABELS}
                        href={assetHref?.(e.assetId)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
