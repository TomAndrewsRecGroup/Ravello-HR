'use client';

import { useState } from 'react';

export default function UnsubscribeClient({ token, alreadyUnsubscribed }: { token: string; alreadyUnsubscribed: boolean }) {
  const [done, setDone] = useState(alreadyUnsubscribed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/r/roles/${token}/unsubscribe`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Something went wrong. Please try again.'); return; }
      setDone(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status">
        <h1 className="a2i-display mt-3" style={{ fontSize: 28 }}>You&rsquo;re unsubscribed.</h1>
        <p className="a2i-prose mt-4" style={{ fontSize: 15 }}>
          You won&rsquo;t get the Thursday roles email any more. You&rsquo;re still part of Athletes To Industry — if you
          change your mind, just reply to one of Tom&rsquo;s emails.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="a2i-display mt-3" style={{ fontSize: 28 }}>Stop the Thursday roles email?</h1>
      <p className="a2i-prose mt-4" style={{ fontSize: 15 }}>
        You&rsquo;ll stop receiving the weekly list of live roles. You&rsquo;ll stay on the Athletes To Industry programme.
      </p>
      {error && <p className="a2i-prose mt-3" style={{ fontSize: 14, color: '#f2b8b5' }} role="alert">{error}</p>}
      <div className="mt-6">
        <button type="button" className="a2i-btn" onClick={go} disabled={busy}>
          {busy ? 'Updating…' : 'Unsubscribe'}
        </button>
      </div>
    </>
  );
}
