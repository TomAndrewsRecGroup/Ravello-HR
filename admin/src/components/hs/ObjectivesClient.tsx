'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, Target } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  OBJECTIVE_STATUS_LABELS, type ObjectiveStatus,
  OBJECTIVE_TARGET_DIRECTIONS, OBJECTIVE_TARGET_DIRECTION_LABELS, type ObjectiveTargetDirection,
} from '@/lib/hs/vocab';
import type { Objective, ObjectiveMeasurement, ManagementSystemStandard, RequirementEvidenceLink } from '@/lib/hs/types';
import EvidenceLinksPanel from './EvidenceLinksPanel';

interface Props {
  companyId: string;
  objectives: Objective[];
  measurements: ObjectiveMeasurement[];
  standards: ManagementSystemStandard[];
  people: { id: string; full_name: string }[];
  evidenceLinks: RequirementEvidenceLink[];
  loadError: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_COLOUR: Record<ObjectiveStatus, string> = {
  draft:     'var(--ink-faint)',
  active:    'var(--blue)',
  on_track:  'var(--teal)',
  at_risk:   'var(--gold)',
  achieved:  'var(--success)',
  missed:    'var(--red)',
  abandoned: 'var(--ink-faint)',
};

export default function ObjectivesClient({ companyId, objectives, measurements, standards, people, evidenceLinks, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [measureOpenFor, setMeasureOpenFor] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [standardId, setStandardId] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetUnit, setTargetUnit] = useState('');
  const [baselineValue, setBaselineValue] = useState('');
  const [targetDirection, setTargetDirection] = useState<ObjectiveTargetDirection>('increase');
  const [targetDate, setTargetDate] = useState('');
  const [ownerPersonId, setOwnerPersonId] = useState('');

  const [measureValue, setMeasureValue] = useState('');
  const [measureNotes, setMeasureNotes] = useState('');

  const standardsById = new Map(standards.map(s => [s.id, s]));
  const peopleById = new Map(people.map(p => [p.id, p.full_name]));

  async function addObjective(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await createClient().from('objectives').insert({
      company_id: companyId,
      title: title.trim(),
      description: description.trim() || null,
      standard_id: standardId || null,
      target_value: targetValue ? Number(targetValue) : null,
      target_unit: targetUnit.trim() || null,
      baseline_value: baselineValue ? Number(baselineValue) : null,
      target_direction: targetDirection,
      target_date: targetDate || null,
      owner_person_id: ownerPersonId || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Objective added', 'success');
    setTitle(''); setDescription(''); setStandardId(''); setTargetValue(''); setTargetUnit('');
    setBaselineValue(''); setTargetDirection('increase'); setTargetDate(''); setOwnerPersonId(''); setAddOpen(false);
    router.refresh();
  }

  async function recordMeasurement(objectiveId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!measureValue) return;
    setBusy(true);
    const { error } = await createClient().from('objective_measurements').insert({
      objective_id: objectiveId, value: Number(measureValue), notes: measureNotes.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Measurement recorded — status recalculated automatically', 'success');
    setMeasureValue(''); setMeasureNotes(''); setMeasureOpenFor(null);
    router.refresh();
  }

  async function abandonObjective(objectiveId: string) {
    if (!confirm('Mark this objective as abandoned? It will no longer be updated by new measurements.')) return;
    setBusy(true);
    const res = await createClient().from('objectives').update({ status: 'abandoned' }, COUNT_EXACT).eq('id', objectiveId);
    setBusy(false);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Save failed', 'error'); return; }
    toast('Objective marked abandoned', 'success');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Progress status (on track / at risk / achieved / missed) is calculated automatically by the platform from
        the latest measurement against the stated target — never a manual judgement call.
      </div>
      <div className="flex">
        <button type="button" className="btn-cta btn-sm ml-auto" onClick={() => setAddOpen(o => !o)}>
          <Plus size={14} className="mr-1" /> Add objective
        </button>
      </div>
      {addOpen && (
        <form onSubmit={addObjective} className="card p-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Title</label>
            <input className="input" required value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Description (optional)</label>
            <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Linked standard (optional)</label>
            <select className="input" value={standardId} onChange={e => setStandardId(e.target.value)}>
              <option value="">None</option>
              {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Owner (optional)</label>
            <select className="input" value={ownerPersonId} onChange={e => setOwnerPersonId(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Target value (optional)</label>
            <input type="number" step="any" className="input" value={targetValue} onChange={e => setTargetValue(e.target.value)} />
          </div>
          <div>
            <label className="label">Target unit (optional)</label>
            <input className="input" placeholder="e.g. %, incidents, hours" value={targetUnit} onChange={e => setTargetUnit(e.target.value)} />
          </div>
          <div>
            <label className="label">Baseline value (optional)</label>
            <input type="number" step="any" className="input" value={baselineValue} onChange={e => setBaselineValue(e.target.value)} />
          </div>
          <div>
            <label className="label">Direction</label>
            <select className="input" value={targetDirection} onChange={e => setTargetDirection(e.target.value as ObjectiveTargetDirection)}>
              {OBJECTIVE_TARGET_DIRECTIONS.map(d => <option key={d} value={d}>{OBJECTIVE_TARGET_DIRECTION_LABELS[d]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Target date (optional)</label>
            <input type="date" className="input" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
          </div>
          <div className="col-span-2 flex justify-end">
            <button type="submit" className="btn-cta btn-sm" disabled={busy || !title.trim()}>Add objective</button>
          </div>
        </form>
      )}

      {objectives.length === 0 ? (
        <div className="card empty-state p-10">
          <Target size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No objectives recorded for this client yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {objectives.map(o => {
            const isExpanded = expanded === o.id;
            const objMeasurements = measurements.filter(m => m.objective_id === o.id);
            const standard = o.standard_id ? standardsById.get(o.standard_id) : null;
            const owner = o.owner_person_id ? peopleById.get(o.owner_person_id) : null;
            return (
              <div key={o.id} className="card p-0 overflow-hidden">
                <button type="button" className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(isExpanded ? null : o.id)}>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <strong>{o.title}</strong>
                    {standard && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{standard.name}</span>}
                    {owner && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Owner: {owner}</span>}
                    <span className="ml-auto text-sm font-medium" style={{ color: STATUS_COLOUR[o.status] }}>
                      {OBJECTIVE_STATUS_LABELS[o.status]}
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t p-4 space-y-4" style={{ borderColor: 'var(--line)' }}>
                    {o.description && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{o.description}</p>}
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><span className="label">Target</span><p>{o.target_value ?? '—'} {o.target_unit ?? ''}</p></div>
                      <div><span className="label">Baseline</span><p>{o.baseline_value ?? '—'}</p></div>
                      <div><span className="label">Target date</span><p>{fmt(o.target_date)}</p></div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Measurements</h4>
                        <div className="flex gap-2">
                          {o.status !== 'abandoned' && (
                            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => abandonObjective(o.id)}>Abandon</button>
                          )}
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setMeasureOpenFor(measureOpenFor === o.id ? null : o.id)}>
                            <Plus size={12} className="mr-1" /> Record measurement
                          </button>
                        </div>
                      </div>
                      {measureOpenFor === o.id && (
                        <form onSubmit={e => recordMeasurement(o.id, e)} className="grid grid-cols-2 gap-3 items-end">
                          <div>
                            <label className="label">Value</label>
                            <input type="number" step="any" className="input" required value={measureValue} onChange={e => setMeasureValue(e.target.value)} />
                          </div>
                          <div className="col-span-2">
                            <label className="label">Notes (optional)</label>
                            <textarea className="input" rows={2} value={measureNotes} onChange={e => setMeasureNotes(e.target.value)} />
                          </div>
                          <button type="submit" className="btn-cta btn-sm" disabled={busy}>Save measurement</button>
                        </form>
                      )}
                      {objMeasurements.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No measurements recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {objMeasurements.map(m => (
                            <li key={m.id} className="rounded-md p-3 text-sm flex items-center justify-between" style={{ background: 'var(--surface-soft)' }}>
                              <span className="font-medium">{m.value} {o.target_unit ?? ''}</span>
                              <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{fmtDateTime(m.measured_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <EvidenceLinksPanel companyId={companyId} sourceType="objective" sourceId={o.id} links={evidenceLinks} />
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
