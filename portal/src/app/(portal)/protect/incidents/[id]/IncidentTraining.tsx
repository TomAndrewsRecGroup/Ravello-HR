'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fmtDate, fmtDateTime } from '@/lib/hs/safetyFormat';
import { trainingFindingLabel, trainingFindingText, trainingFindingTone } from '@/lib/hs/trainingFinding';
import Pill from '@/components/safety/Pill';
import type { Person, TrainingCheckRow, TrainingEvidenceRow } from './types';

export interface TrainingPerson { incidentPersonId: string; name: string; role: string; onRecord: boolean }

// Incident → training (spec 59, migration 130). Two things per person:
//  • the training they held, each record's status ON THE INCIDENT DATE
//    (incident_training_evidence — investigators and approvers only);
//  • what the investigator RECORDED as relevant ("Training required:
//    Working at Height"), a snapshot the database computed and stamped.
// Facts only. Nothing here marks training as a cause: that is the
// investigator's decision, recorded as a cause in the investigation.
export default function IncidentTraining({ people, evidence, evidenceFailed = false, checks, canRecord, dir }: {
  incidentId: string; people: TrainingPerson[]; evidence: TrainingEvidenceRow[] | null; evidenceFailed?: boolean; checks: TrainingCheckRow[];
  canRecord: boolean; dir: Person[];
}) {
  const router = useRouter();
  const [course, setCourse] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const who = (id: string | null) => (id ? dir.find(p => p.user_id === id)?.full_name ?? 'Someone outside this organisation' : '—');

  async function record(personId: string) {
    const c = (course[personId] ?? '').trim();
    if (!c) return;
    setBusy(personId); setErr(null);
    const { error } = await createClient().rpc('record_incident_training_check', {
      p_incident_person: personId, p_course: c, p_note: (note[personId] ?? '').trim() || null,
    });
    setBusy(null);
    if (error) {
      setErr(error.code === '23505'
        ? `"${c}" is already recorded for this person. Withdraw it first if it needs re-checking.`
        : error.message);
      return;
    }
    setCourse(s => ({ ...s, [personId]: '' })); setNote(s => ({ ...s, [personId]: '' }));
    router.refresh();
  }

  async function withdraw(check: TrainingCheckRow) {
    const reason = prompt(`Why is "${check.course_name}" being withdrawn? The finding is kept, marked withdrawn.`);
    if (reason === null) return;
    if (!reason.trim()) { setErr('Give a reason to withdraw a training check.'); return; }
    setBusy(check.id); setErr(null);
    const { error } = await createClient().rpc('withdraw_incident_training_check', { p_check: check.id, p_reason: reason.trim() });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    router.refresh();
  }

  const onRecord = people.filter(p => p.onRecord);
  const external = people.filter(p => !p.onRecord);
  const anyWithdrawn = checks.some(c => c.withdrawn_at);

  return (
    <section className="card p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap size={16} style={{ color: 'var(--ink-soft)' }} aria-hidden />
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Training at the time</h2>
        {anyWithdrawn && (
          <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setShowWithdrawn(v => !v)}>
            {showWithdrawn ? 'Hide withdrawn' : 'Show withdrawn'}
          </button>
        )}
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Facts from the training record as they stood on the incident date. They are evidence, not a conclusion: whether training
        played a part is the investigator&apos;s decision, recorded as a cause in the investigation.
      </p>
      {err && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{err}</p>}

      {onRecord.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          Nobody on this incident is on the organisation&apos;s records, so there is no training to review.
          {external.length > 0 && ' Visitors, contractors and members of the public named by hand have no training record here.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {onRecord.map(p => {
            const mine = checks.filter(c => c.incident_person_id === p.incidentPersonId && (showWithdrawn || !c.withdrawn_at));
            const held = evidence?.filter(e => e.incident_person_id === p.incidentPersonId) ?? null;
            const suggestions = [...new Set((held ?? []).map(h => h.course_name))];
            const listId = `courses-${p.incidentPersonId}`;
            return (
              <li key={p.incidentPersonId} className="space-y-2" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{p.name} <span className="text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>· {p.role}</span></p>

                {mine.length > 0 && (
                  <ul className="space-y-1.5">
                    {mine.map(c => (
                      <li key={c.id} className="text-sm rounded-lg p-2" style={{ background: 'var(--surface-soft)', opacity: c.withdrawn_at ? 0.6 : 1 }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span style={{ color: 'var(--ink)' }}>Training required: <strong>{c.course_name}</strong></span>
                          <Pill tone={c.withdrawn_at ? 'muted' : trainingFindingTone(c.status_at_incident)}>
                            {c.withdrawn_at ? 'Withdrawn' : trainingFindingLabel(c.status_at_incident)}
                          </Pill>
                          {canRecord && !c.withdrawn_at && (
                            <button type="button" className="btn-ghost btn-sm ml-auto" disabled={busy === c.id} onClick={() => withdraw(c)}>
                              {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : 'Withdraw'}
                            </button>
                          )}
                        </div>
                        <p style={{ color: 'var(--ink-soft)' }}>Recorded completion: {trainingFindingText(c)}</p>
                        {c.note && <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{c.note}</p>}
                        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                          Checked by {who(c.checked_by)}, {fmtDateTime(c.checked_at)}
                          {c.withdrawn_at && <> · withdrawn by {who(c.withdrawn_by)}, {fmtDateTime(c.withdrawn_at)}: {c.withdrawn_reason}</>}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                {evidenceFailed ? (
                  <p role="alert" className="text-xs" style={{ color: 'var(--red)' }}>The training record could not be loaded. Refresh to try again.</p>
                ) : held === null ? (
                  <p className="text-xs flex items-center gap-1" style={{ color: 'var(--ink-faint)' }}>
                    <Lock size={12} /> The full training record is shown only to investigators.
                  </p>
                ) : held.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No training records are held for this person.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="table text-sm">
                      <thead><tr><th>Training on record</th><th>Completed</th><th>Expires</th><th>On the incident date</th></tr></thead>
                      <tbody>
                        {held.map(h => (
                          <tr key={h.training_record_id}>
                            <td>{h.course_name}{h.provider && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}> · {h.provider}</span>}</td>
                            <td>{fmtDate(h.completed_on)}</td>
                            <td>{h.expires_on ? fmtDate(h.expires_on) : 'No expiry'}</td>
                            <td><Pill tone={trainingFindingTone(h.status_at_incident)}>{trainingFindingLabel(h.status_at_incident)}</Pill></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {canRecord && (
                  <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end no-print" onSubmit={e => { e.preventDefault(); record(p.incidentPersonId); }}>
                    <label className="text-sm">
                      <span className="label">Training required for the work</span>
                      <input className="input" list={listId} maxLength={200} value={course[p.incidentPersonId] ?? ''}
                        onChange={e => setCourse(s => ({ ...s, [p.incidentPersonId]: e.target.value }))} placeholder="e.g. Working at Height" />
                      <datalist id={listId}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
                    </label>
                    <label className="text-sm">
                      <span className="label">Note (optional)</span>
                      <input className="input" maxLength={1000} value={note[p.incidentPersonId] ?? ''}
                        onChange={e => setNote(s => ({ ...s, [p.incidentPersonId]: e.target.value }))} />
                    </label>
                    <button className="btn-secondary" style={{ minHeight: 44 }} disabled={busy === p.incidentPersonId || !(course[p.incidentPersonId] ?? '').trim()}>
                      {busy === p.incidentPersonId ? <Loader2 size={14} className="animate-spin" /> : 'Check the record'}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {onRecord.length > 0 && external.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {external.map(p => p.name).join(', ')}: named by hand, so no training record is held here.
        </p>
      )}
    </section>
  );
}
