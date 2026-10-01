'use client';
import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

const BIG = { minHeight: 44 } as const;

// Entity QR badge → report an issue tied to the scanned asset/COSHH
// assessment, with no login — the WorkerScanView ReportForm.tsx
// precedent, trimmed further since an object has no "site of its
// own" concept: a location is always optional here (the asset's own
// site, if any, is used server-side when present).
export default function EntityReportForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [what, setWhat] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string } | null>(null);

  const ready = title.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/e/${encodeURIComponent(token)}/report-hazard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), description: what.trim(), location: location.trim() }),
    });
    const body = await res.json().catch(() => ({ error: 'Something went wrong.' }));
    setBusy(false);
    if (!res.ok) { setError(body.error ?? 'Something went wrong.'); return; }
    setDone({ ref: body.reference ?? '' });
  }

  if (done) {
    return (
      <div className="space-y-2 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: 'var(--teal)' }}>
          <CheckCircle2 size={18} /> Reported{done.ref ? ` — ${done.ref}` : ''}
        </p>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="label">Short title</span>
        <input className="input" style={BIG} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required
          placeholder="e.g. Guard missing, warning light on" />
      </label>
      <label className="block">
        <span className="label">What did you see?</span>
        <textarea className="input" rows={3} value={what} onChange={e => setWhat(e.target.value)} maxLength={4000} />
      </label>
      <label className="block">
        <span className="label">Where is this (if not obvious)?</span>
        <input className="input" style={BIG} value={location} onChange={e => setLocation(e.target.value)} maxLength={300} />
      </label>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" style={BIG} onClick={onDone}>Cancel</button>
        <button className="btn-cta flex-1" style={BIG} disabled={busy || !ready}>
          {busy && <Loader2 size={16} className="animate-spin" />} Send
        </button>
      </div>
    </form>
  );
}
