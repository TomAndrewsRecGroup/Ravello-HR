'use client';
import { useState } from 'react';
import { DEPLOYMENT_STATUS_COLOURS, DEPLOYMENT_STATUS_LABELS, type DeploymentStatus } from '@/lib/workforce/vocab';

// Public, anonymous badge scan view. Shows the coarse Safe to Deploy
// status only — never the reasons/requirements the engine also
// computes (worker_qr_status(), 179, deliberately omits them). Whoever
// is standing in front of this screen may have no platform login at
// all; this is the whole point of the feature.
export default function WorkerScanView({
  token, fullName, jobTitle, companyName, siteName, status, initialCheckedIn,
}: {
  token: string;
  fullName: string;
  jobTitle: string | null;
  companyName: string | null;
  siteName: string | null;
  status: string;
  initialCheckedIn: boolean;
}) {
  const [checkedIn, setCheckedIn] = useState(initialCheckedIn);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const known = (Object.keys(DEPLOYMENT_STATUS_LABELS) as DeploymentStatus[]).includes(status as DeploymentStatus);
  const label = known ? DEPLOYMENT_STATUS_LABELS[status as DeploymentStatus] : status;
  const colour = known ? DEPLOYMENT_STATUS_COLOURS[status as DeploymentStatus] : 'var(--ink-faint)';

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/w/${encodeURIComponent(token)}/${checkedIn ? 'checkout' : 'checkin'}`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) { setMessage(body.error ?? 'Something went wrong.'); return; }
      if (checkedIn) {
        setCheckedIn(false);
        setMessage('Checked out.');
      } else {
        setCheckedIn(true);
        setMessage(body.alreadyCheckedIn ? 'Already checked in.' : 'Checked in.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
      <div className="w-full max-w-[420px] rounded-[20px] p-8 space-y-4" style={{ background: '#fff', border: '1px solid var(--line)' }}>
        <div className="text-center space-y-1">
          <h1 className="font-display font-bold text-xl" style={{ color: '#0A0F1E' }}>{fullName}</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {jobTitle}
            {jobTitle && companyName && ' · '}
            {companyName}
          </p>
          {siteName && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{siteName}</p>}
        </div>

        <div className="text-center">
          <span className="badge" style={{
            color: colour, borderColor: colour, background: 'var(--surface)', fontWeight: 600,
            fontSize: 13, border: '1px solid', padding: '6px 14px',
          }}>
            {label}
          </span>
        </div>

        <button className="btn-cta w-full" disabled={busy} onClick={toggle}>
          {checkedIn ? 'Check out' : 'Check in'}
        </button>
        {message && <p className="text-sm text-center" style={{ color: 'var(--ink-soft)' }}>{message}</p>}
      </div>
    </main>
  );
}
