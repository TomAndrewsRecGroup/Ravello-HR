'use client';
import { useState } from 'react';
import { CheckCircle2, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { DOC_CATEGORY_LABELS, labelFor } from '@/lib/ui/statusMaps';

interface Props {
  token: string;
  employeeName: string;
  companyName: string;
  document: { name: string; category: string; version: number; url: string | null };
  alreadySigned: boolean;
  acknowledgedAt: string | null;
}

export default function PolicyAckForm({ token, employeeName, companyName, document, alreadySigned, acknowledgedAt }: Props) {
  const [opened, setOpened] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(alreadySigned);

  async function acknowledge() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/policy/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not record your acknowledgement.');
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const category = labelFor(DOC_CATEGORY_LABELS as Record<string, string>, document.category, document.category);

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <CheckCircle2 size={44} style={{ color: 'var(--teal, #14B8A6)' }} className="mx-auto mb-3" />
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>Thank you, {employeeName.split(' ')[0]}</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {alreadySigned && acknowledgedAt
              ? `You acknowledged ${document.name} on ${new Date(acknowledgedAt).toLocaleDateString('en-GB')}. Nothing more to do.`
              : `Your acknowledgement of ${document.name} has been recorded for ${companyName || 'your employer'}. You can close this page.`}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10" style={{ background: '#FAFAF8' }}>
      <div className="w-full max-w-[520px] rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>{companyName || 'Your employer'} · Policy sign-off</p>
        <h1 className="font-display font-bold text-2xl mb-2" style={{ color: '#0A0F1E' }}>Hi {employeeName.split(' ')[0]}, please read and acknowledge</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
          {companyName || 'Your employer'} asks you to confirm you have read and understood the document below. Open it, read it, then tick the box and press acknowledge.
        </p>

        <div className="rounded-xl p-4 mb-6 flex items-start gap-3" style={{ background: 'var(--surface-soft, #F4F5FB)', border: '1px solid var(--line)' }}>
          <FileText size={20} style={{ color: 'var(--purple)' }} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm" style={{ color: '#0A0F1E' }}>{document.name}</p>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{category} · version {document.version}</p>
            {document.url ? (
              <a href={document.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)} className="btn-secondary btn-sm inline-flex items-center gap-1.5 mt-3">
                <ExternalLink size={13} /> Open the document
              </a>
            ) : (
              <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>The document file is not available right now. Ask {companyName || 'your employer'} for a copy before acknowledging.</p>
            )}
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer mb-5">
          <input type="checkbox" className="mt-1 w-4 h-4 rounded" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
          <span className="text-sm" style={{ color: 'var(--ink)' }}>
            I confirm I have read and understood <strong>{document.name}</strong>{!opened && document.url ? ' (open it first if you have not)' : ''}.
          </span>
        </label>

        {error && <p role="alert" className="text-sm mb-4" style={{ color: 'var(--red)' }}>{error}</p>}

        <button type="button" onClick={acknowledge} disabled={loading || !confirmed} className="btn-cta w-full justify-center">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Acknowledge
        </button>
        <p className="text-[11px] mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
          This records the date and time you acknowledged it. No account or password is needed.
        </p>
      </div>
    </main>
  );
}
