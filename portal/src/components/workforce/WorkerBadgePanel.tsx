'use client';
import { useState } from 'react';
import { QrCode, Loader2 } from 'lucide-react';

// Core-OS 360 Phase 14, Group 2. worker_qr_tokens (179) never lets the
// raw token be read back once minted — the QR is rendered ENTIRELY in
// this browser, from the mint response, and never sent anywhere else
// (no third-party QR image service, which would leak the badge URL,
// and therefore the token, off this platform). A regenerated badge
// silently invalidates the old one (the DB's own "at most one active
// per person" rule) — the page must be reopened to see a badge that
// was minted earlier and not saved/printed at the time.
export default function WorkerBadgePanel({
  personId, hasActiveBadge: initialActive, canManage,
}: {
  personId: string;
  hasActiveBadge: boolean;
  canManage: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ url: string; qrDataUrl: string } | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workforce/people/${personId}/badge`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Could not generate a badge.'); return; }
      const { default: QRCode } = await import('qrcode');
      const qrDataUrl = await QRCode.toDataURL(body.url as string, { margin: 1, width: 220 });
      setFresh({ url: body.url, qrDataUrl });
      setActive(true);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workforce/people/${personId}/badge`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Could not revoke the badge.'); return; }
      setActive(false);
      setFresh(null);
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <section className="card p-4">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          <QrCode size={14} className="inline mr-1" />
          Worker QR badge: {active ? 'active' : 'not issued'}
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4 space-y-3 no-print">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          <QrCode size={14} className="inline mr-1" />
          Worker QR badge: {active ? 'active' : 'not issued'}
        </p>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" disabled={busy} onClick={generate}>
            {busy && <Loader2 size={14} className="animate-spin" />} {active ? 'Regenerate badge' : 'Generate badge'}
          </button>
          {active && (
            <button className="btn-ghost btn-sm" disabled={busy} onClick={revoke}>Revoke</button>
          )}
        </div>
      </div>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      {fresh && (
        <div className="flex items-start gap-4 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally-generated data: URL, never a remote image */}
          <img src={fresh.qrDataUrl} alt="Worker QR badge" width={110} height={110} />
          <div className="text-xs space-y-1">
            <p style={{ color: 'var(--ink-soft)' }}>
              Print or save this now — the raw badge cannot be shown again once you leave this page.
              Regenerating replaces it.
            </p>
            <p className="break-all" style={{ color: 'var(--ink-faint)' }}>{fresh.url}</p>
          </div>
        </div>
      )}
    </section>
  );
}
