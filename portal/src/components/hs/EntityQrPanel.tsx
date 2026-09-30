'use client';
import { useEffect, useState } from 'react';
import { QrCode, Loader2, Printer } from 'lucide-react';

// Core-OS 360 Completion Programme, Phase 26, Group 4 (C14.9). A
// machine/COSHH label — the exact WorkerBadgePanel.tsx pattern
// generalised over an entity instead of a person: the raw token/QR
// only ever exists in this component's ephemeral state (never
// persisted, never re-readable — entity_qr_tokens is RLS-on-no-
// policies, migration 196), so printing happens right here, right
// after minting, via the same "single widget takeover" print
// stylesheet WorkerBadgePanel.tsx already established
// (badge-print-mode / badge-print-anchor / badge-print-card in
// globals.css, shared by both this panel and the worker one).
//
// `apiPath` is the one thing that differs per caller (admin's
// equipment route vs. portal's COSHH route) — everything else here is
// identical between the two, so this is a shared-dupe pair, not two
// separate components.
const PRINT_MODE_CLASS = 'badge-print-mode';

export default function EntityQrPanel({
  apiPath, hasActiveBadge: initialActive, canManage, label, subtitle, companyName,
}: {
  apiPath: string;
  hasActiveBadge: boolean;
  canManage: boolean;
  label: string;
  subtitle: string | null;
  companyName: string;
}) {
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ url: string; qrDataUrl: string } | null>(null);

  useEffect(() => {
    function clearPrintMode() { document.body.classList.remove(PRINT_MODE_CLASS); }
    window.addEventListener('afterprint', clearPrintMode);
    return () => window.removeEventListener('afterprint', clearPrintMode);
  }, []);

  function printBadge() {
    document.body.classList.add(PRINT_MODE_CLASS);
    window.print();
    setTimeout(() => document.body.classList.remove(PRINT_MODE_CLASS), 2000);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiPath, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Could not generate a label.'); return; }
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
      const res = await fetch(apiPath, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Could not revoke the label.'); return; }
      setActive(false);
      setFresh(null);
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <p className="text-sm no-print" style={{ color: 'var(--ink-soft)' }}>
        <QrCode size={14} className="inline mr-1" />
        QR label: {active ? 'active' : 'not issued'}
      </p>
    );
  }

  return (
    <div className="space-y-3 badge-print-anchor">
      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          <QrCode size={14} className="inline mr-1" />
          QR label: {active ? 'active' : 'not issued'}
        </p>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" disabled={busy} onClick={generate}>
            {busy && <Loader2 size={14} className="animate-spin" />} {active ? 'Regenerate label' : 'Generate label'}
          </button>
          {active && (
            <button className="btn-ghost btn-sm" disabled={busy} onClick={revoke}>Revoke</button>
          )}
          {fresh && (
            <button className="btn-cta btn-sm" onClick={printBadge}>
              <Printer size={14} /> Print label
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-sm no-print" style={{ color: 'var(--red)' }}>{error}</p>}
      {fresh && (
        <div className="badge-print-card flex items-start gap-4 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally-generated data: URL, never a remote image */}
          <img src={fresh.qrDataUrl} alt="QR label" width={110} height={110} />
          <div className="text-xs space-y-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{label}</p>
            {subtitle && <p style={{ color: 'var(--ink-soft)' }}>{subtitle}</p>}
            <p style={{ color: 'var(--ink-soft)' }}>{companyName}</p>
            <p className="no-print" style={{ color: 'var(--ink-soft)' }}>
              Print or save this now — the raw label cannot be shown again once you leave this page.
              Regenerating replaces it.
            </p>
            <p className="break-all no-print" style={{ color: 'var(--ink-faint)' }}>{fresh.url}</p>
          </div>
        </div>
      )}
    </div>
  );
}
