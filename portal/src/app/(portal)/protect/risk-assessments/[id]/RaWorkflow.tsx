'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, GitBranch, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  DOC_LIVE_STATUSES, RA_REVIEW_REASONS, REVIEW_REASON_LABELS, docNextStatuses, docPath, type DocStatus,
} from '@/lib/hs/safetyVocab';

interface Ra {
  id: string; status: DocStatus; row_version: number; review_date: string | null; assessor_id: string | null;
  created_by: string | null; submitted_by: string | null; site_id: string | null; title: string;
}

const today = () => new Date().toISOString().slice(0, 10);

// The approval workflow bar. It OFFERS only the moves hs_doc_transition_ok
// allows and the viewer's capabilities suggest; hs_doc_guard decides.
// A status change sends the status and its own workflow fields only —
// never content — because the guard refuses content and status changing
// in one statement. The database stamps who and when.
export default function RaWorkflow({ ra, userId, caps, readiness, canNewVersion, openDraftId, sites }: {
  ra: Ra; userId: string | null;
  caps: { create: boolean; approve: boolean };
  readiness: { items: number; unrated: number };
  canNewVersion: boolean;
  openDraftId: string | null;
  sites: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState<DocStatus | 'reschedule' | 'clone' | null>(null);
  const [comments, setComments] = useState('');
  const [reason, setReason] = useState<string>('scheduled');
  const [reviewDate, setReviewDate] = useState('');
  const [cloneSite, setCloneSite] = useState(ra.site_id ?? '');
  const [cloneTitle, setCloneTitle] = useState(`${ra.title} (copy)`.slice(0, 200));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const s = ra.status;
  const live = (DOC_LIVE_STATUSES as readonly string[]).includes(s);
  const editable = s === 'draft' || s === 'changes_requested';
  const ownWork = !!userId && [ra.created_by, ra.submitted_by, ra.assessor_id].includes(userId);

  const allowed = (to: DocStatus): boolean => {
    switch (to) {
      case 'pending_review': case 'draft': case 'review_due': return caps.create;
      case 'changes_requested': case 'approved': case 'active': return caps.approve;
      case 'archived': return caps.approve || (editable && caps.create);
      default: return false; // superseded: only ever automatic
    }
  };
  const moves = docNextStatuses('risk_assessment', s).filter(allowed);

  const label = (to: DocStatus): string => {
    switch (to) {
      case 'pending_review': return 'Submit for review';
      case 'draft': return s === 'pending_review' ? 'Withdraw to draft' : 'Return to draft';
      case 'changes_requested': return 'Request changes';
      case 'approved': return 'Approve';
      case 'active': return s === 'review_due' ? 'Confirm review complete' : 'Make active';
      case 'review_due': return 'Mark review due';
      case 'archived': return 'Archive';
      default: return to;
    }
  };

  // What hs_doc_guard / hs_doc_ready will refuse a submission for.
  const missing: string[] = [];
  if (!ra.assessor_id) missing.push('Name the assessor');
  if (!ra.review_date) missing.push('Set a review date');
  if (readiness.items === 0) missing.push('Add at least one hazard');
  if (readiness.unrated > 0) missing.push(`Give a residual risk rating to ${readiness.unrated} hazard${readiness.unrated === 1 ? '' : 's'}`);

  async function move(to: DocStatus) {
    const patch: Record<string, unknown> = { status: to };
    if (to === 'changes_requested') {
      if (!comments.trim()) { setMsg({ ok: false, text: 'Say what needs to change.' }); return; }
      patch.review_comments = comments.trim();
    }
    if (to === 'review_due') patch.review_reason = reason;
    if (to === 'active' && s === 'review_due') {
      if (!reviewDate || reviewDate <= today()) { setMsg({ ok: false, text: 'Set the next review date (after today) to confirm the review.' }); return; }
      patch.review_date = reviewDate;
    }
    if (to === 'archived' && !confirm('Archive this version? It stays available in the version history but is no longer in use.')) return;
    setBusy(true); setMsg(null);
    const res = await createClient().from('risk_assessments').update(patch, COUNT_EXACT).eq('id', ra.id).eq('row_version', ra.row_version);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The status change');
    if (!out.ok) {
      setMsg({ ok: false, text: res.count === 0 && !res.error ? 'Someone else changed this assessment since you opened it. Refresh and try again.' : out.message! });
      return;
    }
    setPick(null); setComments('');
    setMsg({ ok: true, text: 'Done.' });
    router.refresh();
  }

  async function reschedule() {
    if (!reviewDate) { setMsg({ ok: false, text: 'Choose the new review date.' }); return; }
    setBusy(true); setMsg(null);
    const res = await createClient().from('risk_assessments').update({ review_date: reviewDate }, COUNT_EXACT).eq('id', ra.id).eq('row_version', ra.row_version);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The review date');
    if (!out.ok) {
      setMsg({ ok: false, text: res.count === 0 && !res.error ? 'Someone else changed this assessment since you opened it. Refresh and try again.' : out.message! });
      return;
    }
    setPick(null); setMsg({ ok: true, text: 'Review date changed.' });
    router.refresh();
  }

  async function newVersion() {
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc('hs_new_version', { p_kind: 'risk_assessment', p_id: ra.id });
    setBusy(false);
    if (error || !data) { setMsg({ ok: false, text: error?.message ?? 'The new version was not created.' }); return; }
    router.push(docPath('risk_assessment', data as string));
  }

  async function clone() {
    if (!cloneTitle.trim()) { setMsg({ ok: false, text: 'Give the copy a title.' }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc('hs_clone', {
      p_kind: 'risk_assessment', p_id: ra.id, p_site: cloneSite || null, p_title: cloneTitle.trim(),
    });
    setBusy(false);
    if (error || !data) { setMsg({ ok: false, text: error?.message ?? 'The copy was not created.' }); return; }
    router.push(docPath('risk_assessment', data as string));
  }

  const nothing = moves.length === 0 && !canNewVersion && !caps.create && !(live && caps.approve);
  if (nothing) return null;

  return (
    <section className="card p-4 space-y-3 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold mr-2" style={{ color: 'var(--ink)' }}>Workflow</h2>
        {moves.map(to => (
          <button key={to} type="button" disabled={busy}
            className={to === 'approved' || to === 'pending_review' ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'}
            style={{ minHeight: 40 }} onClick={() => { setMsg(null); setPick(pick === to ? null : to); }}>
            {label(to)}
          </button>
        ))}
        {live && caps.approve && (
          <button type="button" className="btn-ghost btn-sm" style={{ minHeight: 40 }} onClick={() => { setMsg(null); setPick(pick === 'reschedule' ? null : 'reschedule'); }}>
            Change review date
          </button>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {canNewVersion && (
            <button type="button" className="btn-secondary btn-sm" style={{ minHeight: 40 }} disabled={busy} onClick={newVersion}
              title="Revise this approved assessment as a new draft version. This version stays in force until the new one is approved.">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />} New version
            </button>
          )}
          {openDraftId && (
            <a className="btn-ghost btn-sm" href={docPath('risk_assessment', openDraftId)}>Open the version being drafted</a>
          )}
          {caps.create && (
            <button type="button" className="btn-ghost btn-sm" style={{ minHeight: 40 }} onClick={() => { setMsg(null); setPick(pick === 'clone' ? null : 'clone'); }}>
              <Copy size={14} /> Clone
            </button>
          )}
        </span>
      </div>

      {pick === 'pending_review' && (
        <div className="space-y-2">
          {missing.length > 0 ? (
            <div className="text-sm" style={{ color: 'var(--gold)' }}>
              <p>Before this can be submitted:</p>
              <ul className="list-disc pl-5">{missing.map(m => <li key={m}>{m}</li>)}</ul>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>An approver who did not write or submit this version will review it. Content is locked while it is under review.</p>
          )}
          <button className="btn-cta btn-sm" disabled={busy} onClick={() => move('pending_review')}>{busy && <Loader2 size={14} className="animate-spin" />} Submit for review</button>
        </div>
      )}
      {pick === 'changes_requested' && (
        <div className="space-y-2">
          <label className="block"><span className="label">What needs to change?</span>
            <textarea className="input" rows={3} value={comments} onChange={e => setComments(e.target.value)} maxLength={4000} required /></label>
          <button className="btn-secondary btn-sm" disabled={busy || !comments.trim()} onClick={() => move('changes_requested')}>{busy && <Loader2 size={14} className="animate-spin" />} Send back with comments</button>
        </div>
      )}
      {pick === 'approved' && (
        <div className="space-y-2">
          {ownWork && <p className="text-sm" style={{ color: 'var(--gold)' }}>You wrote, submitted or are the assessor on this version. Another approver must approve it.</p>}
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Approving confirms you have reviewed every hazard, rating and control. It supersedes any earlier approved version of this assessment.
            Record control effectiveness in the hazards below before approving.
          </p>
          <button className="btn-cta btn-sm" disabled={busy} onClick={() => move('approved')}>{busy && <Loader2 size={14} className="animate-spin" />} Approve this version</button>
        </div>
      )}
      {pick === 'active' && (
        <div className="space-y-2">
          {s === 'review_due' ? (
            <>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                Confirm only if the assessment is still valid unchanged. If anything material has changed, create a new version instead.
              </p>
              <label className="block max-w-xs"><span className="label">Next review date</span>
                <input className="input" type="date" min={today()} value={reviewDate} onChange={e => setReviewDate(e.target.value)} required /></label>
            </>
          ) : <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Mark this approved version as in use.</p>}
          <button className="btn-cta btn-sm" disabled={busy} onClick={() => move('active')}>{busy && <Loader2 size={14} className="animate-spin" />} {label('active')}</button>
        </div>
      )}
      {pick === 'review_due' && (
        <div className="space-y-2">
          <label className="block max-w-xs"><span className="label">Reason for review</span>
            <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
              {RA_REVIEW_REASONS.map(r => <option key={r} value={r}>{REVIEW_REASON_LABELS[r]}</option>)}
            </select></label>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Nothing in the assessment changes. A person reviews it and either confirms it or creates a new version.</p>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => move('review_due')}>{busy && <Loader2 size={14} className="animate-spin" />} Mark review due</button>
        </div>
      )}
      {pick === 'draft' && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>The version goes back to draft so it can be edited, then submitted again.</p>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => move('draft')}>{busy && <Loader2 size={14} className="animate-spin" />} {label('draft')}</button>
        </div>
      )}
      {pick === 'archived' && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Archive when this assessment no longer applies (the activity has stopped, the site has closed).</p>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => move('archived')}>{busy && <Loader2 size={14} className="animate-spin" />} Archive this version</button>
        </div>
      )}
      {pick === 'reschedule' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="label">New review date</span>
            <input className="input" type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} /></label>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={reschedule}>{busy && <Loader2 size={14} className="animate-spin" />} Save review date</button>
        </div>
      )}
      {pick === 'clone' && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Copy this assessment for another site or a similar activity. The copy is a new draft marked &ldquo;copied from&rdquo; this one; every
            control effectiveness finding is reset, because it has not been reviewed where it will apply.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block"><span className="label">Title of the copy</span>
              <input className="input" value={cloneTitle} onChange={e => setCloneTitle(e.target.value)} maxLength={200} /></label>
            <label className="block"><span className="label">Site</span>
              <select className="input" value={cloneSite} onChange={e => setCloneSite(e.target.value)}>
                <option value="">Same as this assessment</option>{sites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
          </div>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={clone}>{busy && <Loader2 size={14} className="animate-spin" />} Create copy</button>
        </div>
      )}
      {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
    </section>
  );
}
