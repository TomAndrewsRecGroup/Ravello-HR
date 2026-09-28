'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Scale } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  RIDDOR_DECISIONS, RIDDOR_DECISION_LABELS, RIDDOR_FLAGS, RIDDOR_FLAG_LABELS, RIDDOR_REVIEW_STATUS_LABELS,
  type RiddorDecision, type RiddorFlag, type RiddorReviewStatus,
} from '@/lib/hs/safetyVocab';
import Pill, { toneFor } from '@/components/safety/Pill';
import type { Person, RiddorRow } from './types';

type Flags = Record<RiddorFlag, boolean | null>;
const fmt = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '—');

// RIDDOR review (125). The questions are decision support: answering
// "yes" flags the review as POTENTIALLY reportable, it never decides.
// Only a person holding riddor.review records the decision, always with
// a rationale; the database stamps who and when. Nothing here submits
// anything to the HSE.
export default function RiddorPanel({ companyId, incidentId, incidentStatus, review, canEditPrompts, canDecide, dir, open }: {
  companyId: string; incidentId: string; incidentStatus: RiddorReviewStatus; review: RiddorRow | null;
  canEditPrompts: boolean; canDecide: boolean; dir: Person[]; open: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [flags, setFlags] = useState<Flags>(() => Object.fromEntries(RIDDOR_FLAGS.map(k => [k, review ? review[k] : null])) as Flags);
  const [notes, setNotes] = useState(review?.notes ?? '');
  const [decision, setDecision] = useState<RiddorDecision | ''>(review?.decision ?? '');
  const [rationale, setRationale] = useState(review?.rationale ?? '');
  const [ref, setRef] = useState(review?.reporting_reference ?? '');
  const [reportDate, setReportDate] = useState(review?.report_date ?? '');
  const name = (id: string | null) => (id ? dir.find(p => p.user_id === id)?.full_name ?? 'Someone outside this organisation' : '—');
  const editable = open && (canEditPrompts || canDecide);

  async function saveAnswers() {
    setBusy('answers'); setMsg(null);
    const sb = createClient();
    const payload = { ...flags, notes: notes.trim() || null };
    let problem: string | null;
    if (review) {
      const res = await sb.from('riddor_reviews').update(payload, COUNT_EXACT).eq('id', review.id).eq('row_version', review.row_version);
      problem = res.count === 0 && !res.error ? 'Someone else changed this review. Refresh to see their change.' : judgeWrite(res, 'The RIDDOR review').message;
    } else {
      const { error } = await sb.from('riddor_reviews').insert({ company_id: companyId, incident_id: incidentId, ...payload });
      problem = error?.message ?? null;
    }
    setBusy(null);
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    setMsg({ ok: true, text: 'Answers saved.' });
    router.refresh();
  }

  async function saveDecision() {
    if (!decision) { setMsg({ ok: false, text: 'Choose a decision.' }); return; }
    if (!rationale.trim()) { setMsg({ ok: false, text: 'Record the rationale for the RIDDOR decision.' }); return; }
    setBusy('decision'); setMsg(null);
    const sb = createClient();
    const payload = {
      decision, rationale: rationale.trim(),
      reporting_reference: decision === 'reportable' ? ref.trim() || null : null,
      report_date: decision === 'reportable' ? reportDate || null : null,
    };
    let problem: string | null;
    if (review) {
      const res = await sb.from('riddor_reviews').update(payload, COUNT_EXACT).eq('id', review.id).eq('row_version', review.row_version);
      problem = res.count === 0 && !res.error ? 'Someone else changed this review. Refresh to see their change.' : judgeWrite(res, 'The RIDDOR decision').message;
    } else {
      const { error } = await sb.from('riddor_reviews').insert({ company_id: companyId, incident_id: incidentId, ...flags, notes: notes.trim() || null, ...payload });
      problem = error?.message ?? null;
    }
    setBusy(null);
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    setMsg({ ok: true, text: 'Decision recorded.' });
    router.refresh();
  }

  const status = review?.status ?? incidentStatus;
  return (
    <section className="card p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}><Scale size={16} /> RIDDOR review</h2>
        <Pill tone={toneFor(status)}>{RIDDOR_REVIEW_STATUS_LABELS[status] ?? status}</Pill>
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Decision support only. The platform never submits anything to the HSE and never decides whether an event is reportable —
        an authorised person does, and records why. Reports are made to the HSE separately; record the reference here once made.
      </p>

      <fieldset className="space-y-1">
        <legend className="label">Questions</legend>
        {RIDDOR_FLAGS.map(k => (
          <div key={k} className="flex flex-wrap items-center gap-3 text-sm py-1" style={{ borderBottom: '1px solid var(--line)' }}>
            <span className="flex-1 min-w-[220px]" style={{ color: 'var(--ink-soft)' }}>{RIDDOR_FLAG_LABELS[k]}</span>
            {editable ? (
              <span className="flex gap-3">
                {([['Yes', true], ['No', false], ['Not known', null]] as const).map(([label, v]) => (
                  <label key={label} className="flex items-center gap-1" style={{ minHeight: 32 }}>
                    <input type="radio" name={`riddor-${k}`} checked={flags[k] === v} onChange={() => setFlags({ ...flags, [k]: v })} /> {label}
                  </label>
                ))}
              </span>
            ) : <strong style={{ color: 'var(--ink)' }}>{flags[k] == null ? 'Not known' : flags[k] ? 'Yes' : 'No'}</strong>}
          </div>
        ))}
      </fieldset>
      {editable ? (
        <label className="block"><span className="label">Notes</span>
          <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} /></label>
      ) : review?.notes ? <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{review.notes}</p> : null}
      {editable && (
        <button className="btn-secondary btn-sm no-print" onClick={saveAnswers} disabled={busy !== null}>
          {busy === 'answers' && <Loader2 size={14} className="animate-spin" />} {review ? 'Save answers' : 'Start RIDDOR review'}</button>
      )}

      <div className="space-y-2" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Decision</h3>
        {review?.decision ? (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Decision</dt><dd>{RIDDOR_DECISION_LABELS[review.decision]}</dd></div>
            <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Decided by</dt><dd>{name(review.decision_by)}, {fmt(review.decision_at)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Rationale</dt><dd className="whitespace-pre-wrap">{review.rationale}</dd></div>
            {review.decision === 'reportable' && <>
              <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>HSE reporting reference</dt><dd>{review.reporting_reference ?? 'Not recorded yet'}</dd></div>
              <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Report date</dt><dd>{fmt(review.report_date)}</dd></div>
            </>}
          </dl>
        ) : <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No decision recorded.</p>}

        {canDecide && open ? (
          <div className="grid gap-2 sm:grid-cols-2 no-print">
            <label className="block"><span className="label">Decision</span>
              <select className="input" value={decision} onChange={e => setDecision(e.target.value as RiddorDecision | '')}>
                <option value="">Choose…</option>{RIDDOR_DECISIONS.map(x => <option key={x} value={x}>{RIDDOR_DECISION_LABELS[x]}</option>)}</select></label>
            <div />
            <label className="block sm:col-span-2"><span className="label">Rationale (required)</span>
              <textarea className="input" rows={3} value={rationale} onChange={e => setRationale(e.target.value)} maxLength={4000} /></label>
            {decision === 'reportable' && <>
              <label className="block"><span className="label">HSE reporting reference (once reported)</span>
                <input className="input" value={ref} onChange={e => setRef(e.target.value)} maxLength={100} /></label>
              <label className="block"><span className="label">Report date</span>
                <input className="input" type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} /></label>
            </>}
            <div className="sm:col-span-2">
              <button className="btn-cta btn-sm" onClick={saveDecision} disabled={busy !== null || !decision || !rationale.trim()}>
                {busy === 'decision' && <Loader2 size={14} className="animate-spin" />} Record decision</button>
            </div>
          </div>
        ) : !canDecide && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Only someone authorised for RIDDOR review can record the decision.</p>}
      </div>
      {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
    </section>
  );
}
