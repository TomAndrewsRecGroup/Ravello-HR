'use client';
import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function OpenWorkspace({ organisationId, name, next }: { organisationId: string; name: string | null; next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true); setError(null);
    const res = await fetch('/api/organisation/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organisationId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setBusy(false);
      setError(j.error ?? 'Could not open that workspace.');
      return;
    }
    // A full navigation, never a client-side one: nothing from the
    // previous organisation may survive the switch.
    window.location.assign(next);
  }

  return (
    <div className="card p-6 max-w-md w-full space-y-4 text-center">
      <ShieldCheck size={28} className="mx-auto" style={{ color: 'var(--teal)' }} />
      <h1 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
        {name ? `Work in ${name}` : 'Open this workspace'}
      </h1>
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        You will be working inside this organisation&apos;s records until you switch again. The switch is recorded.
      </p>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="flex justify-center gap-2">
        <button className="btn-cta" onClick={go} disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />} Continue</button>
        <a className="btn-ghost" href="/dashboard">Cancel</a>
      </div>
    </div>
  );
}
