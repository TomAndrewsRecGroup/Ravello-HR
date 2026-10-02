// Critical Control Visibility (go-live gap list, item 4, 2026-10-02).
// A shared-dupe presentational component, the ComplianceTwinView
// precedent: identical already-computed statuses, only the per-item
// link target differs by caller (admin links to the portal's own
// risk-assessment page, since hazards/risk assessments have no
// admin-side per-record page; portal links to its own page directly).
import type { CriticalControlStatus } from '@/lib/criticalControls/compute';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';

const BAND_COLOUR: Record<CriticalControlStatus['band'], string> = { gap: 'var(--red)', unverified: 'var(--gold)', effective: 'var(--teal)' };
const BAND_LABEL: Record<CriticalControlStatus['band'], string> = { gap: 'Gap', unverified: 'Unverified', effective: 'Effective' };
const BAND_ICON: Record<CriticalControlStatus['band'], typeof ShieldAlert> = { gap: ShieldAlert, unverified: ShieldQuestion, effective: ShieldCheck };

export default function CriticalControlsView({
  statuses, loadError, raHref,
}: {
  statuses: CriticalControlStatus[];
  loadError: string | null;
  /** Build the link for one risk assessment id. */
  raHref: (riskAssessmentId: string) => string;
}) {
  if (loadError) {
    return <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Critical controls could not be loaded. Refresh to try again.</p>;
  }

  const gapCount = statuses.filter(s => s.band === 'gap').length;
  const unverifiedCount = statuses.filter(s => s.band === 'unverified').length;

  return (
    <div className="space-y-4">
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-faint)' }}>
        Every control marked safety-critical on this organisation&rsquo;s own control library (never a guess —
        a plain flag set by whoever manages that control), and currently relied on by at least one risk assessment.
        {' '}A control the catalogue never marks safety-critical, or one nobody has used yet, is never shown here.
      </div>

      {statuses.length === 0 ? (
        <div className="card p-10">
          <div className="empty-state">
            <ShieldCheck size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              No safety-critical control is currently in use. Mark a control safety-critical from a risk assessment&rsquo;s own controls panel.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.gap}` }}>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Gaps</p>
              <p className="text-2xl font-semibold" style={{ color: BAND_COLOUR.gap }}>{gapCount}</p>
            </div>
            <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.unverified}` }}>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Unverified</p>
              <p className="text-2xl font-semibold" style={{ color: BAND_COLOUR.unverified }}>{unverifiedCount}</p>
            </div>
            <div className="card p-4" style={{ borderLeft: `3px solid ${BAND_COLOUR.effective}` }}>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Safety-critical controls in use</p>
              <p className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{statuses.length}</p>
            </div>
          </div>

          <div className="card divide-y" style={{ borderColor: 'var(--line)' }}>
            {statuses.map(s => {
              const Icon = BAND_ICON[s.band];
              return (
                <div key={s.controlId} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} style={{ color: BAND_COLOUR[s.band] }} />
                    <strong style={{ color: 'var(--ink)' }}>{s.title}</strong>
                    <span className="badge" style={{ background: BAND_COLOUR[s.band], color: 'white' }}>{BAND_LABEL[s.band]}</span>
                  </div>
                  <ul className="text-sm space-y-1">
                    {s.uses.map((u, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <a href={raHref(u.riskAssessmentId)} className="underline" style={{ color: 'var(--purple)' }}>{u.riskAssessmentTitle}</a>
                        <span style={{ color: BAND_COLOUR[u.band] }}>{u.effectiveness.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
