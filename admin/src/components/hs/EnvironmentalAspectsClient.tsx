'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Leaf, Plus, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import {
  ENVIRONMENTAL_ASPECT_TYPES, ENVIRONMENTAL_ASPECT_TYPE_LABELS,
  ENVIRONMENTAL_ASPECT_CONDITIONS, ENVIRONMENTAL_ASPECT_CONDITION_LABELS,
  ENVIRONMENTAL_ASPECT_STATUS_LABELS, type EnvironmentalAspectStatus, type EnvironmentalAspectType,
  type EnvironmentalAspectCondition,
} from '@/lib/hs/vocab';
import type { EnvironmentalAspect, EnvironmentalAspectAssessment } from '@/lib/hs/types';

interface Props {
  companyId: string;
  aspects: EnvironmentalAspect[];
  assessments: EnvironmentalAspectAssessment[];
  loadError: string | null;
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOUR: Record<EnvironmentalAspectStatus, string> = {
  draft: 'var(--ink-faint)',
  assessed: 'var(--blue)',
  confirmed_significant: 'var(--red)',
  confirmed_not_significant: 'var(--teal)',
  superseded: 'var(--ink-faint)',
};

// Rule 2, absolute: significance is likelihood x severity x frequency,
// a deterministic score the database computes (GENERATED ALWAYS), never
// a black box. is_significant is decided here — the database refuses
// to store it without a confirmed_by/confirmed_at pair (migration
// 156's environmental_aspect_assessments_fill() trigger), so this form
// cannot bypass that gate even if it tried to omit the confirmation
// checkbox: the insert would simply fail.
const DEFAULT_THRESHOLD = 45; // out of a maximum 125 (5 x 5 x 5)

export default function EnvironmentalAspectsClient({ companyId, aspects, assessments, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assessingId, setAssessingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [activity, setActivity] = useState('');
  const [aspectType, setAspectType] = useState<EnvironmentalAspectType>('other');
  const [condition, setCondition] = useState<EnvironmentalAspectCondition>('normal');
  const [description, setDescription] = useState('');

  const [likelihood, setLikelihood] = useState(3);
  const [severity, setSeverity] = useState(3);
  const [frequency, setFrequency] = useState(3);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [methodologyNotes, setMethodologyNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const latestAssessment = (aspectId: string) => assessments.find(a => a.aspect_id === aspectId) ?? null;
  const rawScore = likelihood * severity * frequency;
  const wouldBeSignificant = rawScore >= threshold;

  async function submitAspect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('environmental_aspects').insert({
      company_id: companyId, activity: activity.trim(), aspect_type: aspectType,
      condition, description: description.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Environmental aspect added', 'success');
    setActivity(''); setDescription(''); setOpen(false);
    router.refresh();
  }

  async function submitAssessment(aspectId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) { toast('Confirm this assessment before saving — significance is never decided automatically.', 'error'); return; }
    setBusy(true);
    const sb = createClient();
    const { data: userData } = await sb.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) { setBusy(false); toast('Could not identify the signed-in user to confirm this assessment.', 'error'); return; }
    const { error } = await sb.from('environmental_aspect_assessments').insert({
      aspect_id: aspectId,
      likelihood, severity, frequency,
      significance_threshold_used: threshold,
      is_significant: wouldBeSignificant,
      confirmed_by: uid,
      confirmed_at: new Date().toISOString(),
      methodology_notes: methodologyNotes.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(wouldBeSignificant ? 'Assessment saved — confirmed significant' : 'Assessment saved — confirmed not significant', 'success');
    setAssessingId(null); setConfirmed(false); setMethodologyNotes('');
    setLikelihood(3); setSeverity(3); setFrequency(3); setThreshold(DEFAULT_THRESHOLD);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}

      <div className="flex justify-end">
        <button type="button" className="btn-cta btn-sm" onClick={() => setOpen(o => !o)}>
          <Plus size={14} className="mr-1" /> Add aspect
        </button>
      </div>

      {open && (
        <form onSubmit={submitAspect} className="card p-4 space-y-3">
          <div>
            <label className="label">Activity / process</label>
            <input className="input" required value={activity} onChange={e => setActivity(e.target.value)} placeholder="e.g. Diesel generator run during power cuts" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Aspect type</label>
              <select className="input" value={aspectType} onChange={e => setAspectType(e.target.value as EnvironmentalAspectType)}>
                {ENVIRONMENTAL_ASPECT_TYPES.map(t => <option key={t} value={t}>{ENVIRONMENTAL_ASPECT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Condition</label>
              <select className="input" value={condition} onChange={e => setCondition(e.target.value as EnvironmentalAspectCondition)}>
                {ENVIRONMENTAL_ASPECT_CONDITIONS.map(c => <option key={c} value={c}>{ENVIRONMENTAL_ASPECT_CONDITION_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save aspect'}</button>
        </form>
      )}

      {aspects.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <Leaf size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No environmental aspects recorded yet</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {aspects.map(aspect => {
            const isExpanded = expanded === aspect.id;
            const assessment = latestAssessment(aspect.id);
            const superseded = aspect.status === 'superseded';
            return (
              <div key={aspect.id} className="card p-0 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : aspect.id)}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <strong style={{ color: superseded ? 'var(--ink-faint)' : 'var(--ink)' }}>{aspect.activity}</strong>
                      <span className="badge">{ENVIRONMENTAL_ASPECT_TYPE_LABELS[aspect.aspect_type]}</span>
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>v{aspect.version}</span>
                      <span className="text-sm font-medium" style={{ color: STATUS_COLOUR[aspect.status] }}>
                        {aspect.status === 'confirmed_significant' && <ShieldAlert size={12} className="inline mr-1" />}
                        {ENVIRONMENTAL_ASPECT_STATUS_LABELS[aspect.status]}
                      </span>
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--line)' }}>
                    {aspect.description && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{aspect.description}</p>}

                    {assessment && (
                      <div className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-soft)' }}>
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                          <span>Likelihood: <strong>{assessment.likelihood}</strong></span>
                          <span>Severity: <strong>{assessment.severity}</strong></span>
                          <span>Frequency: <strong>{assessment.frequency}</strong></span>
                          <span>Score: <strong>{assessment.computed_score}</strong> / threshold {assessment.significance_threshold_used}</span>
                        </div>
                        {assessment.confirmed_at && (
                          <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Confirmed {fmt(assessment.confirmed_at)}</p>
                        )}
                      </div>
                    )}

                    {!superseded && (
                      assessingId === aspect.id ? (
                        <form onSubmit={e => submitAssessment(aspect.id, e)} className="space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="label">Likelihood (1-5)</label>
                              <input type="number" min={1} max={5} className="input" value={likelihood} onChange={e => setLikelihood(Number(e.target.value))} />
                            </div>
                            <div>
                              <label className="label">Severity (1-5)</label>
                              <input type="number" min={1} max={5} className="input" value={severity} onChange={e => setSeverity(Number(e.target.value))} />
                            </div>
                            <div>
                              <label className="label">Frequency (1-5)</label>
                              <input type="number" min={1} max={5} className="input" value={frequency} onChange={e => setFrequency(Number(e.target.value))} />
                            </div>
                          </div>
                          <div>
                            <label className="label">Significance threshold (1-125)</label>
                            <input type="number" min={1} max={125} className="input" value={threshold} onChange={e => setThreshold(Number(e.target.value))} />
                          </div>
                          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                            Computed score: <strong>{rawScore}</strong> — {wouldBeSignificant
                              ? <span style={{ color: 'var(--red)' }}>meets or exceeds the threshold (significant)</span>
                              : <span style={{ color: 'var(--teal)' }}>below the threshold (not significant)</span>}
                          </p>
                          <div>
                            <label className="label">Methodology notes</label>
                            <textarea className="input" rows={2} value={methodologyNotes} onChange={e => setMethodologyNotes(e.target.value)} />
                          </div>
                          <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />
                            I confirm this significance assessment. This is a human decision — the platform never
                            decides significance automatically.
                          </label>
                          <div className="flex gap-2">
                            <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save assessment'}</button>
                            <button type="button" className="btn-secondary btn-sm" onClick={() => setAssessingId(null)}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setAssessingId(aspect.id)}>
                          Assess significance
                        </button>
                      )
                    )}
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
