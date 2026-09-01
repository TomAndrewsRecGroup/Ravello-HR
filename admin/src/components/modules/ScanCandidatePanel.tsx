'use client';

// Score a candidate against this role by hand.
//
// The referral pipeline only scores what Manatal's job boards deliver.
// A CV that arrived by email, or somebody sourced directly, could be
// stored as a candidate but never scored — so the role analysis was
// useful only inside the automated funnel.

import { useState } from 'react';
import { Loader2, Sparkles, X, AlertCircle } from 'lucide-react';
import { revalidateAdminPath } from '@/app/actions';

interface Props {
  requisitionId: string;
  /** When absent the scan falls back to JD text, which is worth saying
   *  out loud — the score is then computed against text rather than the
   *  stored IvyLens role. */
  ivylensRoleId: string | null;
}

interface Result {
  score: number;
  notes: string;
  saved: boolean;
  scanned_against: 'role_id' | 'jd_text';
}

function bandColour(score: number): string {
  if (score >= 75) return 'var(--teal)';
  if (score >= 50) return 'var(--gold)';
  return 'var(--red)';
}

export default function ScanCandidatePanel({ requisitionId, ivylensRoleId }: Props) {
  const [open,     setOpen]     = useState(false);
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [cvText,   setCvText]   = useState('');
  const [notes,    setNotes]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [result,   setResult]   = useState<Result | null>(null);

  const canScan = name.trim().length > 0 && cvText.trim().length > 0 && !busy;

  async function scan() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/requisitions/${requisitionId}/scan-candidate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          full_name: name.trim(),
          email:     email.trim(),
          cv_text:   cvText,
          recruiter_notes: notes.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A failed scan must never read as a low score.
        setError(json.error ?? `Scan failed (${res.status})`);
        return;
      }
      setResult({
        score: json.score, notes: json.notes,
        saved: json.saved, scanned_against: json.scanned_against,
      });
      setName(''); setEmail(''); setCvText(''); setNotes('');
      revalidateAdminPath(`/hiring/${requisitionId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Scan a candidate against this role</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            Paste a CV to score it with IvyLens. The candidate is saved against this role
            with the score, and is <strong>not</strong> shared with the client.
          </p>
        </div>
        <button onClick={() => setOpen(v => !v)} className="btn-secondary btn-sm flex items-center gap-1.5">
          {open ? <><X size={12} /> Close</> : <><Sparkles size={12} /> Add &amp; scan</>}
        </button>
      </div>

      {!ivylensRoleId && (
        <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--gold)' }}>
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          This role has no IvyLens role id yet, so the scan will run against the JD text.
          Press <strong>Analyse role</strong> first for a more consistent score.
        </p>
      )}

      {open && (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="scan-name">Candidate name *</label>
              <input id="scan-name" className="input" placeholder="Jane Smith"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="scan-email">Email</label>
              <input id="scan-email" type="email" className="input" placeholder="jane@example.com"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="scan-cv">CV text *</label>
            <textarea id="scan-cv" className="input h-40 resize-y"
              placeholder="Paste the CV here — experience, skills, education."
              value={cvText} onChange={e => setCvText(e.target.value)} />
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              {cvText.trim().length.toLocaleString()} characters. Paste the whole CV —
              a thin extract scores like a weak candidate.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="scan-notes">Recruiter notes</label>
            <input id="scan-notes" className="input" placeholder="Internal only — where they came from, anything relevant"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <button onClick={scan} disabled={!canScan} className="btn-cta btn-sm flex items-center gap-1.5">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {busy ? 'Scoring…' : 'Scan against this role'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>
      )}

      {result && (
        <div className="rounded-[10px] p-3" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold" style={{ color: bandColour(result.score) }}>{result.score}%</span>
            <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              match{result.saved ? ' · saved against this role' : ''}
            </span>
            {result.scanned_against === 'jd_text' && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(191,143,40,0.14)', color: 'var(--gold)' }}>
                scored against JD text
              </span>
            )}
          </div>
          {result.notes && (
            <pre className="text-xs mt-2 whitespace-pre-wrap font-sans" style={{ color: 'var(--ink-soft)' }}>
              {result.notes}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
