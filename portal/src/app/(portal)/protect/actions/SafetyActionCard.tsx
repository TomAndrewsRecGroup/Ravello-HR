'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Paperclip, ShieldCheck, Undo2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { uploadEvidence, HS_EVIDENCE_ACCEPT } from '@/lib/hs/evidence';
import { ACTION_STATUS_LABELS, ACTION_PRIORITY_LABELS, type ActionPriority } from '@/lib/ui/statusMaps';
import {
  ACTION_CLASS_LABELS, EFFECTIVENESS_OUTCOMES, EFFECTIVENESS_OUTCOME_LABELS, type ActionClass, type EffectivenessOutcome,
} from '@/lib/hs/safetyVocab';
import Pill, { toneFor } from '@/components/safety/Pill';
import EvidenceLinks from '@/components/hs/EvidenceLinks';

export interface SafetyAction {
  id: string; company_id: string; title: string; description: string | null; status: string; priority: string; action_class: string | null;
  due_date: string | null; assigned_to: string | null; verifier_id: string | null; created_by: string | null; completed_by: string | null;
  completed_at: string | null; verification_required: boolean; evidence_required: boolean; completion_evidence: { note?: string } | null;
  verification_comments: string | null; verification_rejection_reason: string | null; verification_rejected_at: string | null;
  verified_by: string | null; verified_at: string | null; effectiveness_review_required: boolean; effectiveness_review_date: string | null;
  effectiveness_outcome: string | null; effectiveness_notes: string | null; additional_action_required: boolean | null;
  effectiveness_reviewed_by: string | null; source_type: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '—');

// One safety corrective action and its verification workflow (125/126):
//   assignee: works it and submits it (with evidence when required)
//   named verifier or an assigner: verifies it, or sends it back with a reason
//   after completion: the effectiveness review, where one is required.
// The database decides every move (actions_party_guard, actions_lifecycle)
// — including that nobody verifies their own work — and its message is
// shown as it is written.
export default function SafetyActionCard({ action, userId, canAssign, names, source, files }: {
  action: SafetyAction; userId: string | null; canAssign: boolean; names: Record<string, string>;
  source: { label: string; href: string | null } | null; files: { id: string; storage_path: string; file_name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [comments, setComments] = useState('');
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<EffectivenessOutcome | ''>('');
  const [effNotes, setEffNotes] = useState('');
  const [more, setMore] = useState(false);
  const name = (id: string | null) => (id ? names[id] ?? 'Someone outside this organisation' : '—');

  const a = action;
  const today = new Date().toISOString().slice(0, 10);
  const open = a.status === 'active' || a.status === 'in_progress';
  const overdue = open && !!a.due_date && a.due_date < today;
  const isAssignee = !!userId && a.assigned_to === userId;
  const isVerifier = !!userId && a.verifier_id === userId;
  const didWork = !!userId && a.completed_by === userId;
  const canWork = open && (isAssignee || canAssign);
  const canVerify = a.status === 'awaiting_verification' && (isVerifier || canAssign) && !didWork;
  const canReview = a.status === 'complete' && a.effectiveness_review_required && !a.effectiveness_outcome && (isVerifier || canAssign);

  async function update(patch: Record<string, unknown>) {
    const res = await createClient().from('actions').update(patch, COUNT_EXACT).eq('id', a.id).eq('status', a.status);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The action');
    if (!out.ok) return res.count === 0 && !res.error ? 'This action has changed since you opened the page. Refresh to see it.' : out.message;
    return null;
  }
  async function run(key: string, fn: () => Promise<string | null>) {
    setBusy(key); setErr(null);
    const problem = await fn();
    setBusy(null);
    if (problem) { setErr(problem); return; }
    router.refresh();
  }

  const submit = () => run('submit', async () => {
    if (a.evidence_required && !note.trim() && !file) return 'This action needs completion evidence: describe what was done or attach a file.';
    // Upload first: evidence must exist before the status says it does.
    if (file) {
      const p = await uploadEvidence(createClient(), { companyId: a.company_id, entityType: 'action', entityId: a.id, file, evidenceType: file.type.startsWith('image/') ? 'photo' : 'document', description: note.trim() || null });
      if (p) return p;
    }
    const evidence = note.trim() || file ? { note: note.trim() || null, ...(file ? { file: file.name } : {}) } : null;
    return update({ status: a.verification_required ? 'awaiting_verification' : 'complete', ...(evidence ? { completion_evidence: evidence } : {}) });
  });

  return (
    <div className="card p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{a.title}</p>
        <Pill tone={toneFor(a.status)}>{ACTION_STATUS_LABELS[a.status] ?? a.status}</Pill>
        {a.action_class && <Pill tone="neutral">{ACTION_CLASS_LABELS[a.action_class as ActionClass]}</Pill>}
        <Pill tone={a.priority === 'urgent' || a.priority === 'high' ? 'bad' : 'muted'}>{ACTION_PRIORITY_LABELS[a.priority as ActionPriority] ?? a.priority}</Pill>
        {overdue && <Pill tone="bad">Overdue</Pill>}
        {a.verification_required && <span className="text-xs flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}><ShieldCheck size={12} /> Verification required</span>}
      </div>
      {a.description && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{a.description}</p>}
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-4" style={{ color: 'var(--ink-soft)' }}>
        <div><dt style={{ color: 'var(--ink-faint)' }}>Owner</dt><dd>{a.assigned_to ? name(a.assigned_to) : 'Unassigned'}</dd></div>
        <div><dt style={{ color: 'var(--ink-faint)' }}>Due</dt><dd style={{ color: overdue ? 'var(--red)' : undefined }}>{fmt(a.due_date)}</dd></div>
        <div><dt style={{ color: 'var(--ink-faint)' }}>Verifier</dt><dd>{a.verifier_id ? name(a.verifier_id) : a.verification_required ? 'Anyone who assigns actions' : '—'}</dd></div>
        <div><dt style={{ color: 'var(--ink-faint)' }}>Source</dt><dd>{source ? (source.href ? <Link href={source.href}>{source.label}</Link> : source.label) : '—'}</dd></div>
      </dl>
      {a.completion_evidence?.note && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}><strong>Completion evidence:</strong> {a.completion_evidence.note}{a.completed_by ? ` — ${name(a.completed_by)}, ${fmt(a.completed_at)}` : ''}</p>}
      <EvidenceLinks files={files} />
      {a.verification_rejection_reason && open && (
        <p className="text-sm rounded-[6px] p-2" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--ink-soft)' }}>
          <strong>Sent back{a.verification_rejected_at ? ` on ${fmt(a.verification_rejected_at)}` : ''}:</strong> {a.verification_rejection_reason}</p>
      )}
      {a.verified_at && <p className="text-xs" style={{ color: 'var(--teal)' }}><CheckCircle2 size={12} className="inline" /> Verified by {name(a.verified_by)} on {fmt(a.verified_at)}{a.verification_comments ? ` — ${a.verification_comments}` : ''}</p>}
      {a.effectiveness_outcome && (
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Effectiveness review: <strong>{EFFECTIVENESS_OUTCOME_LABELS[a.effectiveness_outcome as EffectivenessOutcome]}</strong>
          {a.effectiveness_notes ? ` — ${a.effectiveness_notes}` : ''}{a.additional_action_required ? ' · further action required' : ''} ({name(a.effectiveness_reviewed_by)})</p>
      )}
      {a.status === 'complete' && a.effectiveness_review_required && !a.effectiveness_outcome && (
        <p className="text-xs" style={{ color: 'var(--gold)' }}>Effectiveness review due{a.effectiveness_review_date ? ` ${fmt(a.effectiveness_review_date)}` : ''}.</p>
      )}

      {canWork && (
        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="block"><span className="label">What was done{a.evidence_required ? ' (evidence required)' : ' (optional)'}</span>
            <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn-ghost btn-sm cursor-pointer" style={{ minHeight: 40 }}>
              <Paperclip size={14} /> {file ? file.name : 'Attach evidence'}
              <input type="file" className="sr-only" accept={HS_EVIDENCE_ACCEPT.join(',')} onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {a.status === 'active' && (
              <button className="btn-secondary btn-sm" disabled={busy !== null} onClick={() => run('start', () => update({ status: 'in_progress' }))}>
                {busy === 'start' && <Loader2 size={14} className="animate-spin" />} Mark in progress</button>
            )}
            <button className="btn-cta btn-sm" disabled={busy !== null || (a.evidence_required && !note.trim() && !file)} onClick={submit}>
              {busy === 'submit' && <Loader2 size={14} className="animate-spin" />} {a.verification_required ? 'Submit for verification' : 'Mark complete'}</button>
          </div>
        </div>
      )}

      {a.status === 'awaiting_verification' && didWork && (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Waiting for someone else to verify your work.</p>
      )}
      {canVerify && (
        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="block"><span className="label">Verification comments (optional)</span>
            <textarea className="input" rows={2} value={comments} onChange={e => setComments(e.target.value)} maxLength={2000} /></label>
          <label className="block"><span className="label">Reason for sending back (required to send back)</span>
            <input className="input" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} /></label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-cta btn-sm" disabled={busy !== null}
              onClick={() => run('verify', () => update({ status: 'complete', verification_comments: comments.trim() || null }))}>
              {busy === 'verify' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Verify complete</button>
            <button className="btn-secondary btn-sm" disabled={busy !== null || !reason.trim()}
              onClick={() => run('reject', () => update({ status: 'active', verification_rejection_reason: reason.trim() }))}>
              {busy === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />} Send back</button>
          </div>
        </div>
      )}

      {canReview && (
        <div className="grid gap-2 sm:grid-cols-3 items-end pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="block"><span className="label">Effectiveness</span>
            <select className="input" value={outcome} onChange={e => setOutcome(e.target.value as EffectivenessOutcome | '')}>
              <option value="">Choose…</option>{EFFECTIVENESS_OUTCOMES.map(o => <option key={o} value={o}>{EFFECTIVENESS_OUTCOME_LABELS[o]}</option>)}</select></label>
          <label className="block sm:col-span-2"><span className="label">Notes</span>
            <input className="input" value={effNotes} onChange={e => setEffNotes(e.target.value)} maxLength={2000} placeholder="e.g. No repeat defect observed in 30 days" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={more} onChange={e => setMore(e.target.checked)} /> Further action required</label>
          <button className="btn-cta btn-sm" disabled={busy !== null || !outcome}
            onClick={() => run('review', () => update({ effectiveness_outcome: outcome, effectiveness_notes: effNotes.trim() || null, additional_action_required: more }))}>
            {busy === 'review' && <Loader2 size={14} className="animate-spin" />} Record effectiveness review</button>
        </div>
      )}
      {err && <p className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}
    </div>
  );
}
