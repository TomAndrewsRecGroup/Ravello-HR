'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, GitBranch, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  COSHH_REVIEW_REASONS, DOC_STATUS_LABELS, REVIEW_REASON_LABELS, docNextStatuses, docPath,
  type DocStatus,
} from '@/lib/hs/safetyVocab';
import { todayIso } from '@/lib/hs/safetyFormat';

type Kind = 'method_statement' | 'coshh_assessment';
const TABLE: Record<Kind, string> = { method_statement: 'method_statements', coshh_assessment: 'coshh_assessments' };

const VERB: Partial<Record<DocStatus, string>> = {
  pending_review: 'Submit for review', changes_requested: 'Request changes', draft: 'Return to draft',
  approved: 'Approve', active: 'Make active', review_due: 'Flag for review', archived: 'Archive',
};

// The controlled-document workflow bar for RAMS and COSHH assessments.
// It only OFFERS what docNextStatuses and the viewer's capabilities
// allow; hs_doc_guard (123) is the gate — it stamps who/when, refuses
// self-approval and locks decided versions, and its messages are shown
// as written. Every write is conditional on the rendered row_version.
export default function RamsCoshhWorkflow({ kind, doc, canCreate, canApprove, isLatest, sites }: {
  kind: Kind;
  doc: { id: string; status: DocStatus; row_version: number; review_date: string | null; title: string; site_id: string | null };
  canCreate: boolean; canApprove: boolean;
  /** No newer version of this reference exists. */
  isLatest: boolean;
  sites: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<DocStatus | null>(null);
  const [comments, setComments] = useState('');
  const [reason, setReason] = useState<string>('scheduled');
  const [nextReview, setNextReview] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSite, setCloneSite] = useState(doc.site_id ?? '');
  const [cloneTitle, setCloneTitle] = useState(`${doc.title} (copy)`.slice(0, 200));
  const [reschedule, setReschedule] = useState(false);

  const allowed = (to: DocStatus) => {
    switch (to) {
      case 'pending_review': case 'draft': return canCreate;
      case 'changes_requested': case 'approved': case 'active': return canApprove;
      case 'review_due': return canCreate;
      case 'archived': return canApprove || (canCreate && (doc.status === 'draft' || doc.status === 'changes_requested'));
      default: return false; // superseded happens automatically
    }
  };
  const next = docNextStatuses(kind, doc.status).filter(allowed);

  function refused(res: { error: { message: string } | null; count: number | null }, what: string): string | null {
    const out = judgeWrite(res, what);
    if (out.ok) return null;
    return res.count === 0 && !res.error ? 'Someone else changed this record since you opened it. Refresh to see their change.' : out.message;
  }

  async function move() {
    if (!target) return;
    const patch: Record<string, unknown> = { status: target };
    if (target === 'changes_requested') patch.review_comments = comments.trim();
    if (target === 'review_due') patch.review_reason = reason;
    if (target === 'active' && doc.status === 'review_due') patch.review_date = nextReview || null;
    setBusy(true); setMsg(null);
    const res = await createClient().from(TABLE[kind]).update(patch, COUNT_EXACT)
      .eq('id', doc.id).eq('row_version', doc.row_version);
    setBusy(false);
    const problem = refused(res, 'The status change');
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    setTarget(null); setComments('');
    setMsg({ ok: true, text: `Now ${DOC_STATUS_LABELS[target].toLowerCase()}.` });
    router.refresh();
  }

  async function saveReviewDate() {
    setBusy(true); setMsg(null);
    const res = await createClient().from(TABLE[kind]).update({ review_date: nextReview || null }, COUNT_EXACT)
      .eq('id', doc.id).eq('row_version', doc.row_version);
    setBusy(false);
    const problem = refused(res, 'The review date');
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    setReschedule(false);
    setMsg({ ok: true, text: 'Review date changed.' });
    router.refresh();
  }

  async function newVersion() {
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc('hs_new_version', { p_kind: kind, p_id: doc.id });
    setBusy(false);
    if (error || !data) { setMsg({ ok: false, text: error?.message ?? 'The new version could not be created.' }); return; }
    router.push(docPath(kind, data as string));
  }

  async function clone() {
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc('hs_clone', {
      p_kind: kind, p_id: doc.id, p_site: cloneSite || null, p_title: cloneTitle.trim() || null,
    });
    setBusy(false);
    if (error || !data) { setMsg({ ok: false, text: error?.message ?? 'The copy could not be created.' }); return; }
    router.push(docPath(kind, data as string));
  }

  const live = doc.status === 'approved' || doc.status === 'active' || doc.status === 'review_due';

  return (
    <section className="card p-4 space-y-3 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold mr-2" style={{ color: 'var(--ink)' }}>Workflow</h2>
        {next.map(s => (
          <button key={s} type="button" className={s === 'approved' || s === 'pending_review' ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'}
            style={{ minHeight: 40 }} onClick={() => { setTarget(s); setMsg(null); }} disabled={busy}>
            {s === 'active' && doc.status === 'review_due' ? 'Confirm review' : VERB[s] ?? DOC_STATUS_LABELS[s]}
          </button>
        ))}
        {live && canApprove && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setReschedule(r => !r); setNextReview(doc.review_date ?? ''); }}>
            Change review date
          </button>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {live && isLatest && canCreate && (
            <button type="button" className="btn-secondary btn-sm" onClick={newVersion} disabled={busy}><GitBranch size={14} /> New version</button>
          )}
          {canCreate && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCloneOpen(o => !o)} disabled={busy}><Copy size={14} /> Copy</button>
          )}
        </span>
      </div>
      {next.length === 0 && !live && (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {doc.status === 'superseded' || doc.status === 'archived' ? 'This version is no longer in use.' : 'There is nothing you can change on this version at the moment.'}
        </p>
      )}

      {target && (
        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          {target === 'changes_requested' && (
            <label className="block"><span className="label">What needs to change</span>
              <textarea className="input" rows={3} value={comments} onChange={e => setComments(e.target.value)} maxLength={4000} required />
            </label>
          )}
          {target === 'review_due' && (
            <label className="block max-w-sm"><span className="label">Reason for review</span>
              <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
                {COSHH_REVIEW_REASONS.map(r => <option key={r} value={r}>{REVIEW_REASON_LABELS[r]}</option>)}
              </select>
            </label>
          )}
          {target === 'active' && doc.status === 'review_due' && (
            <label className="block max-w-xs"><span className="label">Next review date</span>
              <input className="input" type="date" min={todayIso()} value={nextReview} onChange={e => setNextReview(e.target.value)} required />
            </label>
          )}
          {target === 'approved' && (
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              Approval must come from someone other than the author or the person who submitted it. Approving supersedes any earlier live version of this reference.
            </p>
          )}
          {target === 'archived' && (
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Archived versions stay on record but are no longer in use.</p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-cta btn-sm" onClick={move}
              disabled={busy || (target === 'changes_requested' && !comments.trim()) || (target === 'active' && doc.status === 'review_due' && !nextReview)}>
              {busy && <Loader2 size={14} className="animate-spin" />} Confirm: {DOC_STATUS_LABELS[target]}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setTarget(null)}>Cancel</button>
          </div>
        </div>
      )}

      {reschedule && (
        <div className="flex flex-wrap items-end gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="block"><span className="label">Next review date</span>
            <input className="input" type="date" value={nextReview} onChange={e => setNextReview(e.target.value)} />
          </label>
          <button type="button" className="btn-cta btn-sm" onClick={saveReviewDate} disabled={busy || !nextReview}>Save date</button>
        </div>
      )}

      {cloneOpen && (
        <div className="grid gap-2 sm:grid-cols-3 items-end pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="block sm:col-span-2"><span className="label">Title of the copy</span>
            <input className="input" value={cloneTitle} onChange={e => setCloneTitle(e.target.value)} maxLength={200} />
          </label>
          <label className="block"><span className="label">For site</span>
            <select className="input" value={cloneSite} onChange={e => setCloneSite(e.target.value)}>
              <option value="">Same as this one</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <p className="sm:col-span-3 text-xs" style={{ color: 'var(--ink-faint)' }}>
            The copy is a new draft with its own reference, marked &quot;Copied from&quot; this record. Control effectiveness is reset: review every line where it now applies.
          </p>
          <div className="sm:col-span-3 flex gap-2">
            <button type="button" className="btn-cta btn-sm" onClick={clone} disabled={busy || !cloneTitle.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} Create copy</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCloneOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
    </section>
  );
}
