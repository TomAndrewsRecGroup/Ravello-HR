'use client';
import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, FileSignature } from 'lucide-react';

interface Props {
  token: string;
  employeeName: string;
  companyName: string;
  document: { title: string; body: string };
  status: string;
  signedAt: string | null;
  signedByName: string | null;
  declinedAt: string | null;
}

export default function SignClient({ token, employeeName, companyName, document, status, signedAt, signedByName, declinedAt }: Props) {
  const [consent, setConsent] = useState(false);
  const [signedByNameInput, setSignedByNameInput] = useState(employeeName);
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<'signed' | 'declined' | null>(
    status === 'signed' ? 'signed' : status === 'declined' ? 'declined' : null,
  );

  async function submit(action: 'sign' | 'decline') {
    setLoading(true); setError('');
    try {
      const body = action === 'sign'
        ? { action: 'sign', consent: true, signedByName: signedByNameInput.trim() }
        : { action: 'decline', reason: declineReason.trim() || undefined };
      const res = await fetch(`/api/sign/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not record your response.');
      setResult(action === 'sign' ? 'signed' : 'declined');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (result === 'signed') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <CheckCircle2 size={44} style={{ color: 'var(--teal, #14B8A6)' }} className="mx-auto mb-3" />
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>Thank you, {employeeName.split(' ')[0]}</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {signedByName ? `Signed by ${signedByName}` : 'Your signature'}
            {signedAt ? ` on ${new Date(signedAt).toLocaleDateString('en-GB')}` : ''} has been recorded. You can close this page.
          </p>
        </div>
      </main>
    );
  }

  if (result === 'declined') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <XCircle size={44} style={{ color: 'var(--red)' }} className="mx-auto mb-3" />
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>Declined</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            You have declined to sign this document{declinedAt ? ` on ${new Date(declinedAt).toLocaleDateString('en-GB')}` : ''}.
            {companyName || 'Your employer'} has been told. You can close this page.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10" style={{ background: '#FAFAF8' }}>
      <div className="w-full max-w-[640px] rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>{companyName || 'Your employer'} · For signature</p>
        <h1 className="font-display font-bold text-2xl mb-2" style={{ color: '#0A0F1E' }}>Hi {employeeName.split(' ')[0]}, please review and sign</h1>
        <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>
          Read the document below, then type your full name and tick the box to confirm, or decline if you have a question first.
        </p>

        <div className="rounded-xl p-4 mb-5 flex items-start gap-3" style={{ background: 'var(--surface-soft, #F4F5FB)', border: '1px solid var(--line)' }}>
          <FileSignature size={20} style={{ color: 'var(--purple)' }} className="mt-0.5 shrink-0" />
          <p className="font-semibold text-sm" style={{ color: '#0A0F1E' }}>{document.title}</p>
        </div>

        <div
          className="rounded-xl p-4 mb-5 text-sm whitespace-pre-wrap max-h-[50vh] overflow-y-auto"
          style={{ background: '#fff', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}
        >
          {document.body}
        </div>

        {!showDecline ? (
          <>
            <label className="block mb-3">
              <span className="text-xs font-medium" style={{ color: 'var(--ink-faint)' }}>Your full name (this is your signature)</span>
              <input
                className="input"
                value={signedByNameInput}
                onChange={e => setSignedByNameInput(e.target.value)}
                maxLength={200}
              />
            </label>

            <label className="flex items-start gap-3 cursor-pointer mb-5">
              <input type="checkbox" className="mt-1 w-4 h-4 rounded" checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span className="text-sm" style={{ color: 'var(--ink)' }}>
                I have read and understood this document and I am signing it electronically.
              </span>
            </label>

            {error && <p role="alert" className="text-sm mb-4" style={{ color: 'var(--red)' }}>{error}</p>}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => submit('sign')}
                disabled={loading || !consent || !signedByNameInput.trim()}
                className="btn-cta flex-1 justify-center"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Sign
              </button>
              <button type="button" onClick={() => setShowDecline(true)} disabled={loading} className="btn-secondary">
                Decline
              </button>
            </div>

            <p className="text-[11px] mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
              This records your name, the date and time, and the device you signed from — a simple electronic signature
              under section 7 of the Electronic Communications Act 2000. No account or password is needed.
            </p>
          </>
        ) : (
          <>
            <label className="block mb-3">
              <span className="text-xs font-medium" style={{ color: 'var(--ink-faint)' }}>Reason (optional)</span>
              <textarea className="input" rows={3} maxLength={1000} value={declineReason} onChange={e => setDeclineReason(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-sm mb-4" style={{ color: 'var(--red)' }}>{error}</p>}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => submit('decline')} disabled={loading} className="btn-cta flex-1 justify-center" style={{ background: 'var(--red)' }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} Confirm decline
              </button>
              <button type="button" onClick={() => setShowDecline(false)} disabled={loading} className="btn-secondary">
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
