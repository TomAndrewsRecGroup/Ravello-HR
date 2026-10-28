'use client';

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'done' | 'error';

export default function MatchClient({ token, jobId, alreadyMatched }: { token: string; jobId: string; alreadyMatched: boolean }) {
  const [status, setStatus] = useState<Status>(alreadyMatched ? 'done' : 'idle');
  const [already, setAlready] = useState(alreadyMatched);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function confirm() {
    if (status === 'submitting') return;
    setStatus('submitting');
    setError('');
    try {
      const res = await fetch(`/api/r/roles/${token}/match/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setAlready(Boolean(json.already));
      setStatus('done');
    } catch {
      setStatus('error');
      setError('Network error. Please try again.');
    }
  }

  if (status === 'done') {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="a2i-section-label">{already ? 'Already sent' : 'Sent'}</p>
        <h3 className="a2i-display" style={{ fontSize: 24 }}>Thank you.</h3>
        <p className="a2i-prose" style={{ fontSize: 15 }}>
          {already
            ? 'Tom already has your interest in this role. He will be in touch if it looks like a match.'
            : 'Tom has your details and will look at whether you’re a match for this role. He will be in touch either way.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="a2i-label" htmlFor="note">Anything Tom should know? (optional)</label>
        <textarea
          id="note"
          className="a2i-field mt-2"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. I'm available from next month, or I've done similar work before…"
        />
      </div>
      {status === 'error' && <p className="a2i-prose" style={{ fontSize: 14, color: '#f2b8b5' }} role="alert">{error}</p>}
      <div>
        <button type="button" className="a2i-btn" onClick={confirm} disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Sending…' : 'Yes, match me'}
        </button>
      </div>
      <p className="a2i-prose" style={{ fontSize: 12, opacity: 0.7 }}>
        This sends Tom Andrews your details from the Athletes To Industry programme and the role you&rsquo;re interested in.
      </p>
    </div>
  );
}
