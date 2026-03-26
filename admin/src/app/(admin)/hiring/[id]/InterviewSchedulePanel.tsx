'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2, Calendar, Video, Phone, MapPin, ClipboardList, ChevronDown } from 'lucide-react';

interface Interview {
  id: string;
  candidate_id: string;
  candidate_name?: string;
  stage_number: number;
  stage_label: string | null;
  interview_type: string | null;
  scheduled_at: string | null;
  duration_mins: number | null;
  location_or_link: string | null;
  interviewers: string[] | null;
  status: string;
  outcome: string | null;
  feedback_notes: string | null;
}

interface Candidate {
  id: string;
  full_name: string;
}

interface Props {
  requisitionId: string;
  companyId: string;
  candidates: Candidate[];
  initialInterviews: Interview[];
}

const TYPE_ICON: Record<string, React.ElementType> = {
  video: Video, phone: Phone, in_person: MapPin, task: ClipboardList,
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  scheduled:   { background: 'rgba(59,111,255,0.1)',  color: '#1848CC' },
  completed:   { background: 'rgba(22,163,74,0.1)',   color: '#166534' },
  cancelled:   { background: 'rgba(220,38,38,0.1)',   color: '#991B1B' },
  rescheduled: { background: 'rgba(217,119,6,0.1)',   color: '#92400E' },
  no_show:     { background: 'rgba(127,29,29,0.1)',   color: '#7F1D1D' },
};

const OUTCOME_STYLE: Record<string, React.CSSProperties> = {
  pass:    { background: 'rgba(22,163,74,0.1)',    color: '#166534' },
  fail:    { background: 'rgba(220,38,38,0.1)',    color: '#991B1B' },
  hold:    { background: 'rgba(217,119,6,0.1)',    color: '#92400E' },
  pending: { background: 'rgba(148,163,184,0.1)', color: '#64748B' },
};

const INTERVIEW_TYPES = ['video', 'phone', 'in_person', 'task'];
const STATUSES = ['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show'];
const OUTCOMES = ['pending', 'pass', 'fail', 'hold'];

function fmtDt(dt: string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InterviewSchedulePanel({ requisitionId, companyId, candidates, initialInterviews }: Props) {
  const supabase = createClient();
  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews);
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [form, setForm] = useState({
    candidate_id:    '',
    stage_number:    '1',
    stage_label:     '',
    interview_type:  'video',
    scheduled_at:    '',
    duration_mins:   '60',
    location_or_link: '',
    interviewers:    '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.candidate_id || !form.scheduled_at) return;
    setSaving(true);

    const candidateName = candidates.find(c => c.id === form.candidate_id)?.full_name;

    const { data } = await supabase.from('interview_schedules').insert({
      requisition_id:   requisitionId,
      company_id:       companyId,
      candidate_id:     form.candidate_id,
      stage_number:     parseInt(form.stage_number, 10),
      stage_label:      form.stage_label || null,
      interview_type:   form.interview_type,
      scheduled_at:     form.scheduled_at,
      duration_mins:    form.duration_mins ? parseInt(form.duration_mins, 10) : null,
      location_or_link: form.location_or_link || null,
      interviewers:     form.interviewers ? form.interviewers.split(',').map(s => s.trim()).filter(Boolean) : null,
      status:           'scheduled',
      outcome:          'pending',
    }).select().single();

    if (data) {
      setInterviews(prev => [{ ...(data as any), candidate_name: candidateName }, ...prev]);
    }
    setSaving(false);
    setShowForm(false);
    setForm({ candidate_id: '', stage_number: '1', stage_label: '', interview_type: 'video', scheduled_at: '', duration_mins: '60', location_or_link: '', interviewers: '' });
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('interview_schedules').update({ status }).eq('id', id);
    setInterviews(prev => prev.map(i => i.id === id ? { ...i, status } : i));
  }

  async function updateOutcome(id: string, outcome: string) {
    await supabase.from('interview_schedules').update({ outcome }).eq('id', id);
    setInterviews(prev => prev.map(i => i.id === id ? { ...i, outcome } : i));
  }

  async function saveFeedback(id: string, feedback_notes: string) {
    await supabase.from('interview_schedules').update({ feedback_notes }).eq('id', id);
    setInterviews(prev => prev.map(i => i.id === id ? { ...i, feedback_notes } : i));
  }

  // Group by candidate
  const grouped = candidates.map(c => ({
    candidate: c,
    interviews: interviews.filter(i => i.candidate_id === c.id).sort((a, b) => a.stage_number - b.stage_number),
  })).filter(g => g.interviews.length > 0);

  const unassigned = interviews.filter(i => !candidates.find(c => c.id === i.candidate_id));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
          Interview Schedule
          {interviews.length > 0 && (
            <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,111,255,0.1)', color: '#1848CC' }}>
              {interviews.length}
            </span>
          )}
        </h3>
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Schedule Interview
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-[10px] p-4 mb-4 space-y-4" style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>New Interview</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Candidate *</label>
              <select className="input" value={form.candidate_id} onChange={e => set('candidate_id', e.target.value)}>
                <option value="">Select candidate…</option>
                {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Stage #</label>
              <input type="number" min="1" max="10" className="input" value={form.stage_number} onChange={e => set('stage_number', e.target.value)} />
            </div>
            <div>
              <label className="label">Stage Label</label>
              <input className="input" placeholder="e.g. Competency Interview, Final Panel" value={form.stage_label} onChange={e => set('stage_label', e.target.value)} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.interview_type} onChange={e => set('interview_type', e.target.value)}>
                {INTERVIEW_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date & Time *</label>
              <input type="datetime-local" className="input" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} />
            </div>
            <div>
              <label className="label">Duration (mins)</label>
              <input type="number" min="15" step="15" className="input" value={form.duration_mins} onChange={e => set('duration_mins', e.target.value)} />
            </div>
            <div>
              <label className="label">Location / Link</label>
              <input className="input" placeholder="Zoom link or room" value={form.location_or_link} onChange={e => set('location_or_link', e.target.value)} />
            </div>
            <div>
              <label className="label">Interviewers (comma-separated)</label>
              <input className="input" placeholder="e.g. Lucy, Tom" value={form.interviewers} onChange={e => set('interviewers', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.candidate_id || !form.scheduled_at} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {interviews.length === 0 && !showForm ? (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No interviews scheduled yet.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ candidate, interviews: cInterviews }) => (
            <div key={candidate.id}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-soft)' }}>{candidate.full_name}</p>
              <div className="space-y-2">
                {cInterviews.map(iv => {
                  const TypeIcon = TYPE_ICON[iv.interview_type ?? ''] ?? Calendar;
                  const isOpen = expanded === iv.id;
                  return (
                    <div key={iv.id} className="rounded-[8px]" style={{ border: '1px solid var(--line)' }}>
                      <button
                        className="w-full flex items-center gap-3 p-3 text-left"
                        onClick={() => setExpanded(isOpen ? null : iv.id)}
                      >
                        <TypeIcon size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                              Stage {iv.stage_number}{iv.stage_label ? ` — ${iv.stage_label}` : ''}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={STATUS_STYLE[iv.status] ?? STATUS_STYLE.scheduled}>
                              {iv.status}
                            </span>
                            {iv.outcome && iv.outcome !== 'pending' && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={OUTCOME_STYLE[iv.outcome] ?? OUTCOME_STYLE.pending}>
                                {iv.outcome}
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                            {fmtDt(iv.scheduled_at)}{iv.duration_mins ? ` · ${iv.duration_mins} min` : ''}
                          </p>
                        </div>
                        <ChevronDown size={13} className={`flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--ink-faint)' }} />
                      </button>

                      {isOpen && (
                        <div className="px-3 pb-3 pt-1 space-y-3 border-t" style={{ borderColor: 'var(--line)' }}>
                          {iv.location_or_link && (
                            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                              <span style={{ color: 'var(--ink-faint)' }}>Location: </span>{iv.location_or_link}
                            </p>
                          )}
                          {iv.interviewers?.length ? (
                            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                              <span style={{ color: 'var(--ink-faint)' }}>Interviewers: </span>{iv.interviewers.join(', ')}
                            </p>
                          ) : null}
                          <div className="flex gap-3 flex-wrap">
                            <div>
                              <label className="label text-[10px]">Status</label>
                              <select
                                className="input text-xs py-1 w-auto"
                                value={iv.status}
                                onChange={e => updateStatus(iv.id, e.target.value)}
                              >
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="label text-[10px]">Outcome</label>
                              <select
                                className="input text-xs py-1 w-auto"
                                value={iv.outcome ?? 'pending'}
                                onChange={e => updateOutcome(iv.id, e.target.value)}
                              >
                                {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          </div>
                          <FeedbackEditor interview={iv} onSave={saveFeedback} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-faint)' }}>Other</p>
              {unassigned.map(iv => (
                <div key={iv.id} className="rounded-[8px] p-3" style={{ border: '1px solid var(--line)' }}>
                  <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                    Stage {iv.stage_number} · {fmtDt(iv.scheduled_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackEditor({ interview, onSave }: { interview: Interview; onSave: (id: string, notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(interview.feedback_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(interview.id, notes);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <label className="label text-[10px]">Internal Notes</label>
      <textarea
        className="input h-16 resize-none text-xs"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Interview notes, recruiter feedback…"
      />
      <button onClick={save} disabled={saving} className="btn-secondary btn-sm mt-1.5 flex items-center gap-1">
        {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? '✓ Saved' : 'Save Notes'}
      </button>
    </div>
  );
}
