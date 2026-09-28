'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { HS_EVIDENCE_ACCEPT, evidenceProblem, uploadEvidence } from '@/lib/hs/evidence';
import { todayIso } from '@/lib/hs/safetyFormat';

// Add a safety data sheet. sds_versions is INSERT-ONLY: a new SDS never
// replaces or deletes the old one. The database decides which SDS is
// current (newest issue date), stamps the others superseded, updates
// the substance, and puts every approved COSHH assessment of the
// substance into "review due" — a flag for a person, never a rewrite.
export default function SdsAdd({ substanceId, companyId, currentIssueDate, liveAssessments }: {
  substanceId: string; companyId: string; currentIssueDate: string | null; liveAssessments: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [issue, setIssue] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const becomesCurrent = !!issue && (!currentIssueDate || issue >= currentIssueDate);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setMsg({ ok: false, text: 'Attach the safety data sheet file.' }); return; }
    const problem = evidenceProblem(file);
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    setBusy(true); setMsg(null);
    const sb = createClient();
    const { data, error } = await sb.from('sds_versions').insert({
      company_id: companyId, substance_id: substanceId, version_label: label.trim(), issue_date: issue, notes: notes.trim() || null,
    }).select('id').single();
    if (error || !data) { setBusy(false); setMsg({ ok: false, text: error?.message ?? 'The safety data sheet could not be recorded.' }); return; }
    const upErr = await uploadEvidence(sb, {
      companyId, entityType: 'sds', entityId: data.id as string, file, evidenceType: 'sds', description: `Safety data sheet ${label.trim()}`,
    });
    setBusy(false);
    setLabel(''); setIssue(''); setNotes(''); setFile(null);
    setMsg(upErr
      ? { ok: false, text: `The SDS was recorded but the file did not upload: ${upErr} Attach it again from the history below.` }
      : { ok: true, text: 'Safety data sheet added.' });
    if (!upErr) setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <button type="button" className="btn-cta btn-sm no-print" style={{ minHeight: 40 }} onClick={() => setOpen(true)}><Upload size={14} /> Add safety data sheet</button>
        {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 p-3 rounded no-print" style={{ background: 'var(--surface-soft)' }}>
      <label className="block"><span className="label">SDS version / revision</span>
        <input className="input" value={label} onChange={e => setLabel(e.target.value)} maxLength={60} required placeholder="e.g. Rev 4.1" /></label>
      <label className="block"><span className="label">Issue date (on the SDS)</span>
        <input className="input" type="date" value={issue} max={todayIso()} onChange={e => setIssue(e.target.value)} required /></label>
      <label className="block sm:col-span-2"><span className="label">File</span>
        <input className="input" type="file" accept={HS_EVIDENCE_ACCEPT.join(',')} onChange={e => setFile(e.target.files?.[0] ?? null)} required /></label>
      <label className="block sm:col-span-2"><span className="label">Notes (optional)</span>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="e.g. Supplier changed formulation" /></label>
      {issue && (
        <p className="sm:col-span-2 text-xs" style={{ color: becomesCurrent ? 'var(--gold)' : 'var(--ink-faint)' }}>
          {becomesCurrent
            ? `This will become the current SDS. The previous one is kept as superseded.${liveAssessments > 0 && currentIssueDate ? ` ${liveAssessments} approved COSHH assessment${liveAssessments === 1 ? '' : 's'} of this substance will be flagged for review.` : ''}`
            : 'This is older than the current SDS, so it will be filed as already superseded.'}
        </p>
      )}
      {msg && <p className="sm:col-span-2 text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn-cta btn-sm" disabled={busy || !label.trim() || !issue || !file}>{busy && <Loader2 size={14} className="animate-spin" />} Add SDS</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
