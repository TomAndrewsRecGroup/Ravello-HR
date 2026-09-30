'use client';
import { useEffect, useState } from 'react';
import { QrCode, Loader2, Printer } from 'lucide-react';
import { humanBadgeId } from '@/lib/workforce/badgeId';

// Core-OS 360 Phase 14, Group 2. worker_qr_tokens (179) never lets the
// raw token be read back once minted — the QR is rendered ENTIRELY in
// this browser, from the mint response, and never sent anywhere else
// (no third-party QR image service, which would leak the badge URL,
// and therefore the token, off this platform). A regenerated badge
// silently invalidates the old one (the DB's own "at most one active
// per person" rule) — the page must be reopened to see a badge that
// was minted earlier and not saved/printed at the time.
//
// Core-OS 360 Completion Programme, Phase 26, Group 1 (C14.6): the
// badge is now actually printable, not just an inline image with a
// "print or save this now" instruction that the page's own print
// stylesheet silently hid (this whole section carried `no-print`).
// Since the raw token/QR only ever exists in this component's
// ephemeral state — never persisted, never re-readable — a dedicated
// `/badge/print` route has nothing to render; printing has to happen
// from right here, right after minting. "Print badge" toggles a
// `<body>` class that the print stylesheet (globals.css) uses to hide
// every OTHER section on this page, leaving just the badge card, then
// calls `window.print()` — the same "Save as PDF" pattern every other
// printable record in this codebase already uses, applied to one
// widget instead of a dedicated page. The human-readable fallback id
// (`humanBadgeId()`) is printed next to the QR so a reader whose
// scanner can't read the code can look the person up manually instead
// — through the existing, already-authenticated person search / on-site
// roster, never a new public lookup key of its own.
const PRINT_MODE_CLASS = 'badge-print-mode';

export default function WorkerBadgePanel({
  personId, hasActiveBadge: initialActive, canManage, fullName, employeeNumber, companyName,
}: {
  personId: string;
  hasActiveBadge: boolean;
  canManage: boolean;
  fullName: string;
  employeeNumber: string | null;
  companyName: string;
}) {
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ url: string; qrDataUrl: string } | null>(null);
  const fallbackId = humanBadgeId(employeeNumber, personId);

  useEffect(() => {
    function clearPrintMode() { document.body.classList.remove(PRINT_MODE_CLASS); }
    window.addEventListener('afterprint', clearPrintMode);
    return () => window.removeEventListener('afterprint', clearPrintMode);
  }, []);

  function printBadge() {
    document.body.classList.add(PRINT_MODE_CLASS);
    window.print();
    // afterprint doesn't fire in every browser (notably some mobile
    // WebViews) — a short fallback removal keeps a missed event from
    // leaving the rest of the page permanently hidden.
    setTimeout(() => document.body.classList.remove(PRINT_MODE_CLASS), 2000);
  }

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
      <section className="card p-4 no-print">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          <QrCode size={14} className="inline mr-1" />
          Worker QR badge: {active ? 'active' : 'not issued'}
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4 space-y-3 badge-print-anchor">
      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
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
          {fresh && (
            <button className="btn-cta btn-sm" onClick={printBadge}>
              <Printer size={14} /> Print badge
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-sm no-print" style={{ color: 'var(--red)' }}>{error}</p>}
      {fresh && (
        <div className="badge-print-card flex items-start gap-4 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally-generated data: URL, never a remote image */}
          <img src={fresh.qrDataUrl} alt="Worker QR badge" width={110} height={110} />
          <div className="text-xs space-y-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{fullName}</p>
            <p style={{ color: 'var(--ink-soft)' }}>{companyName}</p>
            <p className="font-mono" style={{ color: 'var(--ink)' }}>ID: {fallbackId}</p>
            <p className="no-print" style={{ color: 'var(--ink-soft)' }}>
              Print or save this now — the raw badge cannot be shown again once you leave this page.
              Regenerating replaces it.
            </p>
            <p className="break-all no-print" style={{ color: 'var(--ink-faint)' }}>{fresh.url}</p>
          </div>
        </div>
      )}
    </section>
  );
}
