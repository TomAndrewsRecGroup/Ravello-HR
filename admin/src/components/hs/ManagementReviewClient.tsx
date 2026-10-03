'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, ClipboardList, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { MANAGEMENT_REVIEW_STATUSES, MANAGEMENT_REVIEW_STATUS_LABELS, type ManagementReviewStatus } from '@/lib/hs/vocab';
import type { ManagementReview, ManagementReviewAttendee, ManagementReviewDataPack, ManagementReviewDecision } from '@/lib/hs/types';
import { computeManagementReviewDataPack, previousCompletedReviewDate, type ManagementReviewDataPack as DataPackShape } from '@/lib/governance/dataPack';
import { buildReviewPdf } from '@/lib/governance/buildReviewPdf';
import LinkedActionBadge, { type LinkedActionSummary } from './LinkedActionBadge';

interface Props {
  companyId: string;
  companyName: string;
  reviews: ManagementReview[];
  attendees: ManagementReviewAttendee[];
  dataPacks: ManagementReviewDataPack[];
  decisions: ManagementReviewDecision[];
  linkedActions: LinkedActionSummary[];
  people: { id: string; full_name: string }[];
  loadError: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATUS_COLOUR: Record<ManagementReviewStatus, string> = {
  scheduled:   'var(--blue)',
  in_progress: 'var(--gold)',
  completed:   'var(--success)',
  cancelled:   'var(--ink-faint)',
};

export default function ManagementReviewClient({ companyId, companyName, reviews, attendees, dataPacks, decisions, linkedActions, people, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [reviewDate, setReviewDate] = useState('');
  const [chairedBy, setChairedBy] = useState('');

  const [attendeePick, setAttendeePick] = useState<Record<string, string>>({});
  const [decisionOpenFor, setDecisionOpenFor] = useState<string | null>(null);
  const [decisionTopic, setDecisionTopic] = useState('');
  const [decisionText, setDecisionText] = useState('');
  const [decisionRaiseAction, setDecisionRaiseAction] = useState(false);

  const peopleById = new Map(people.map(p => [p.id, p.full_name]));

  async function addReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewDate) return;
    setBusy(true);
    const { error } = await createClient().from('management_reviews').insert({
      company_id: companyId, review_date: reviewDate, chaired_by: chairedBy || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Management review scheduled', 'success');
    setReviewDate(''); setChairedBy(''); setAddOpen(false);
    router.refresh();
  }

  async function setStatus(reviewId: string, status: ManagementReviewStatus) {
    setBusy(true);
    const res = await createClient().from('management_reviews').update({ status }, COUNT_EXACT).eq('id', reviewId);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Save failed', 'error'); return; }
    toast(`Review marked ${MANAGEMENT_REVIEW_STATUS_LABELS[status].toLowerCase()}`, 'success');
    router.refresh();
  }

  async function addAttendee(reviewId: string) {
    const personId = attendeePick[reviewId];
    if (!personId) return;
    setBusy(true);
    const { error } = await createClient().from('management_review_attendees').insert({ review_id: reviewId, person_id: personId });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Attendee added', 'success');
    setAttendeePick(prev => ({ ...prev, [reviewId]: '' }));
    router.refresh();
  }

  async function generatePack(reviewId: string) {
    setBusy(true);
    try {
      const sb = createClient();
      const since = await previousCompletedReviewDate(sb, companyId, reviewId);
      const data = await computeManagementReviewDataPack(sb, companyId, since);
      const { error } = await sb.from('management_review_data_pack').insert({ review_id: reviewId, data });
      if (error) { toast(error.message, 'error'); return; }
      toast('Data pack generated', 'success');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function recordDecision(reviewId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!decisionTopic.trim() || !decisionText.trim()) return;
    setBusy(true);
    const sb = createClient();
    try {
      let resultingActionId: string | null = null;
      if (decisionRaiseAction) {
        const { data: action, error: actionError } = await sb.from('actions').insert({
          company_id: companyId,
          action_type: 'management_review',
          title: decisionTopic.trim().slice(0, 200),
          description: decisionText.trim(),
          priority: 'normal',
          source_type: 'management_review',
          source_id: reviewId,
          created_by_admin: true,
        }).select('id').single();
        if (actionError) { toast(actionError.message, 'error'); return; }
        resultingActionId = (action as { id: string } | null)?.id ?? null;
      }
      const { error } = await sb.from('management_review_decisions').insert({
        review_id: reviewId, topic: decisionTopic.trim(), decision_text: decisionText.trim(), resulting_action_id: resultingActionId,
      });
      if (error) { toast(error.message, 'error'); return; }
      toast('Decision recorded', 'success');
      setDecisionTopic(''); setDecisionText(''); setDecisionRaiseAction(false); setDecisionOpenFor(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function printPack(review: ManagementReview) {
    setBusy(true);
    try {
      // Lazy-load jsPDF + autotable so the page bundle stays small — the
      // exact admin/src/lib/valueReport pattern (buildReviewPdf itself
      // is a small local module and stays a normal, static import).
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);
      const pack = dataPacks.filter(p => p.review_id === review.id).sort((a, b) => b.computed_at.localeCompare(a.computed_at))[0] ?? null;
      const reviewDecisions = decisions.filter(d => d.review_id === review.id);
      const reviewAttendees = attendees.filter(a => a.review_id === review.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = buildReviewPdf(jsPDF as any, autoTable, {
        companyName,
        reviewDate: fmt(review.review_date),
        status: MANAGEMENT_REVIEW_STATUS_LABELS[review.status],
        chairedByName: review.chaired_by ? (peopleById.get(review.chaired_by) ?? null) : null,
        attendeeNames: reviewAttendees.map(a => peopleById.get(a.person_id) ?? 'Unknown'),
        pack: pack ? (pack.data as unknown as DataPackShape) : null,
        decisions: reviewDecisions.map(d => ({ topic: d.topic, decision_text: d.decision_text, has_action: !!d.resulting_action_id, created_at: d.created_at })),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).save(`management-review-${review.review_date}.pdf`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not build the PDF', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        The data pack is a stored snapshot of factual counts — generated on demand, never recomputed after the
        fact, so a printed pack always matches what was actually reviewed at the time.
      </div>
      <div className="flex">
        <button type="button" className="btn-cta btn-sm ml-auto" onClick={() => setAddOpen(o => !o)}>
          <Plus size={14} className="mr-1" /> Schedule review
        </button>
      </div>
      {addOpen && (
        <form onSubmit={addReview} className="card p-4 flex gap-3 items-end flex-wrap">
          <div>
            <label className="label">Review date</label>
            <input type="date" className="input" required value={reviewDate} onChange={e => setReviewDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Chaired by (optional)</label>
            <select className="input" value={chairedBy} onChange={e => setChairedBy(e.target.value)}>
              <option value="">Not set</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-cta btn-sm" disabled={busy || !reviewDate}>Schedule</button>
        </form>
      )}

      {reviews.length === 0 ? (
        <div className="card empty-state p-10">
          <ClipboardList size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No management reviews recorded for this client yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => {
            const isExpanded = expanded === r.id;
            const reviewAttendees = attendees.filter(a => a.review_id === r.id);
            const reviewPacks = dataPacks.filter(p => p.review_id === r.id).sort((a, b) => b.computed_at.localeCompare(a.computed_at));
            const latestPack = reviewPacks[0] ?? null;
            const reviewDecisions = decisions.filter(d => d.review_id === r.id);
            const completed = r.status === 'completed';
            return (
              <div key={r.id} className="card p-0 overflow-hidden">
                <button type="button" className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <strong>Review — {fmt(r.review_date)}</strong>
                    {r.chaired_by && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Chaired by {peopleById.get(r.chaired_by) ?? 'Unknown'}</span>}
                    <span className="ml-auto text-sm font-medium" style={{ color: STATUS_COLOUR[r.status] }}>
                      {MANAGEMENT_REVIEW_STATUS_LABELS[r.status]}
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t p-4 space-y-4" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex flex-wrap gap-2">
                      {MANAGEMENT_REVIEW_STATUSES.filter(s => s !== r.status).map(s => (
                        <button key={s} type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setStatus(r.id, s)}>
                          Mark {MANAGEMENT_REVIEW_STATUS_LABELS[s].toLowerCase()}
                        </button>
                      ))}
                      <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => printPack(r)}>
                        <Printer size={12} className="mr-1" /> Print pack
                      </button>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Attendees</h4>
                      <ul className="text-sm space-y-1">
                        {reviewAttendees.length === 0 && <li style={{ color: 'var(--ink-faint)' }}>None recorded.</li>}
                        {reviewAttendees.map(a => <li key={a.id}>{peopleById.get(a.person_id) ?? 'Unknown'}</li>)}
                      </ul>
                      {!completed && (
                        <div className="flex gap-2">
                          <select className="input" value={attendeePick[r.id] ?? ''} onChange={e => setAttendeePick(prev => ({ ...prev, [r.id]: e.target.value }))}>
                            <option value="">Add attendee…</option>
                            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                          </select>
                          <button type="button" className="btn-secondary btn-sm" disabled={busy || !attendeePick[r.id]} onClick={() => addAttendee(r.id)}>Add</button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Data pack</h4>
                        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => generatePack(r.id)}>Generate data pack</button>
                      </div>
                      {latestPack ? (
                        <div className="rounded-md p-3 text-sm space-y-1" style={{ background: 'var(--surface-soft)' }}>
                          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Generated {new Date(latestPack.computed_at).toLocaleString('en-GB')}</p>
                          <p>Open actions: {String((latestPack.data as Record<string, unknown>).open_actions_count ?? '—')}</p>
                          <p>Overdue register items: {String((latestPack.data as Record<string, unknown>).overdue_compliance_items_count ?? '—')}</p>
                          <p>Incidents recorded: {String((latestPack.data as Record<string, unknown>).incidents_count_since ?? '—')}</p>
                        </div>
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No data pack generated yet.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Decisions</h4>
                        {!completed && (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setDecisionOpenFor(decisionOpenFor === r.id ? null : r.id)}>
                            <Plus size={12} className="mr-1" /> Record decision
                          </button>
                        )}
                      </div>
                      {decisionOpenFor === r.id && !completed && (
                        <form onSubmit={e => recordDecision(r.id, e)} className="space-y-2">
                          <input className="input" placeholder="Topic" required value={decisionTopic} onChange={e => setDecisionTopic(e.target.value)} />
                          <textarea className="input" rows={2} placeholder="Decision" required value={decisionText} onChange={e => setDecisionText(e.target.value)} />
                          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                            <input type="checkbox" checked={decisionRaiseAction} onChange={e => setDecisionRaiseAction(e.target.checked)} />
                            Raise a follow-up action for this decision
                          </label>
                          <button type="submit" className="btn-cta btn-sm" disabled={busy}>Save decision</button>
                        </form>
                      )}
                      {completed && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>This review is completed — start a new review to record a further decision.</p>}
                      {reviewDecisions.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No decisions recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {reviewDecisions.map(d => (
                            <li key={d.id} className="rounded-md p-3 text-sm space-y-2" style={{ background: 'var(--surface-soft)' }}>
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{d.topic}</span>
                              </div>
                              <p style={{ color: 'var(--ink-soft)' }}>{d.decision_text}</p>
                              {d.resulting_action_id && (
                                <LinkedActionBadge action={linkedActions.find(a => a.id === d.resulting_action_id) ?? null} />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
