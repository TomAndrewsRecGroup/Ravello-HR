'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  CONTROL_EFFECTIVENESS, CONTROL_EFFECTIVENESS_LABELS, CONTROL_STAGES, CONTROL_TYPES, CONTROL_TYPE_LABELS,
  type ControlEffectiveness, type ControlStage, type ControlType,
} from '@/lib/hs/safetyVocab';
import Pill, { type Tone } from '@/components/safety/Pill';
import type { LibraryControl, Person, RaItemControl } from './raTypes';

const STAGE_LABELS: Record<ControlStage, string> = { existing: 'Existing controls', additional: 'Additional (further) controls' };
const EFF_TONE: Record<ControlEffectiveness, Tone> = {
  in_place: 'good', partially_implemented: 'warn', ineffective: 'bad', not_implemented: 'bad', verification_required: 'neutral',
};
const rank = (t: ControlType) => CONTROL_TYPES.indexOf(t);

// Controls attached to one risk item, from the organisation's control
// library, in hierarchy order (elimination first, PPE last). The link
// row snapshots the control's title and type (hs_ra_control_guard), so
// editing the library never rewrites an approved assessment.
// Effectiveness starts at "verification required": a control is never
// presumed effective. While the version is a draft the author records
// it; during review only an approver may.
export default function ItemControls({ companyId, itemId, links, library, people, editable, reviewing }: {
  companyId: string; itemId: string; links: RaItemControl[]; library: LibraryControl[]; people: Person[];
  editable: boolean; reviewing: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [controlId, setControlId] = useState('');
  const [stage, setStage] = useState<ControlStage>('existing');
  const [eff, setEff] = useState<ControlEffectiveness>('verification_required');
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<ControlType>('engineering');
  const [newDesc, setNewDesc] = useState('');
  const [newVerify, setNewVerify] = useState(false);
  const [newSafetyCritical, setNewSafetyCritical] = useState(false);
  const [togglingCritical, setTogglingCritical] = useState<string | null>(null);
  const canRecord = editable || reviewing;
  const newMode = creating || library.length === 0;
  const who = (id: string | null) => (id ? people.find(p => p.user_id === id)?.full_name ?? 'Someone outside this organisation' : '');

  async function setEffectiveness(link: RaItemControl, value: ControlEffectiveness) {
    setBusy(link.id); setError(null);
    const res = await createClient().from('risk_item_controls').update({ effectiveness: value }, COUNT_EXACT).eq('id', link.id);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The effectiveness');
    if (!out.ok) { setError(out.message); return; }
    router.refresh();
  }

  async function saveNotes(link: RaItemControl, notes: string) {
    if ((link.notes ?? '') === notes.trim()) return;
    setBusy(link.id); setError(null);
    const res = await createClient().from('risk_item_controls').update({ notes: notes.trim() || null }, COUNT_EXACT).eq('id', link.id);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The note');
    if (!out.ok) { setError(out.message); return; }
    router.refresh();
  }

  async function unlink(link: RaItemControl) {
    setBusy(link.id); setError(null);
    const res = await createClient().from('risk_item_controls').delete(COUNT_EXACT).eq('id', link.id);
    setBusy(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The control');
    if (!out.ok) { setError(out.message); return; }
    router.refresh();
  }

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setBusy('add'); setError(null);
    const sb = createClient();
    let cid = controlId;
    let snap: { title: string; control_type: ControlType } | undefined = library.find(c => c.id === controlId);
    if (newMode) {
      const { data, error: err } = await sb.from('controls').insert({
        company_id: companyId, title: newTitle.trim(), control_type: newType, description: newDesc.trim() || null,
        verification_required: newVerify, safety_critical: newSafetyCritical,
      }).select('id, title, control_type').single();
      if (err || !data) { setBusy(null); setError(err?.message ?? 'The control was not added to the library.'); return; }
      cid = data.id as string;
      snap = { title: data.title as string, control_type: data.control_type as ControlType };
    }
    if (!cid || !snap) { setBusy(null); setError('Choose a control.'); return; }
    // control_title / control_type are overwritten by the guard from the
    // library row; they are sent only because the columns are NOT NULL.
    const { error: err } = await sb.from('risk_item_controls').insert({
      company_id: companyId, risk_assessment_item_id: itemId, control_id: cid, stage, effectiveness: eff,
      control_title: snap.title, control_type: snap.control_type,
    });
    setBusy(null);
    if (err) {
      setError(err.code === '23505' ? 'That control is already attached at this stage.' : err.message);
      if (newMode) router.refresh();
      return;
    }
    setAdding(false); setCreating(false); setControlId(''); setNewTitle(''); setNewDesc(''); setNewVerify(false); setNewSafetyCritical(false); setEff('verification_required');
    router.refresh();
  }

  // Critical Control Visibility (go-live gap list, item 4): a plain
  // boolean on the shared controls catalogue (205), toggled from
  // wherever a control is already managed — never a separate page,
  // since this is the one place a control's own row is already
  // editable.
  async function toggleSafetyCritical(controlId: string, next: boolean) {
    setTogglingCritical(controlId); setError(null);
    const res = await createClient().from('controls').update({ safety_critical: next }, COUNT_EXACT).eq('id', controlId);
    setTogglingCritical(null);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The safety-critical flag');
    if (!out.ok) { setError(out.message); return; }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Controls</h3>
      {CONTROL_STAGES.map(st => {
        const rows = links.filter(l => l.stage === st).sort((a, b) => rank(a.control_type) - rank(b.control_type));
        return (
          <div key={st} className="space-y-1">
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>{STAGE_LABELS[st]}</p>
            {rows.length === 0 ? <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>None recorded.</p> : (
              <ul className="space-y-2">
                {rows.map(l => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm p-2 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
                    <Pill tone="neutral">{CONTROL_TYPE_LABELS[l.control_type]}</Pill>
                    {library.find(c => c.id === l.control_id)?.safety_critical && <Pill tone="bad">Safety-critical</Pill>}
                    <span className="flex-1 min-w-[160px]" style={{ color: 'var(--ink)' }}>{l.control_title}</span>
                    {canRecord ? (
                      <select className="input" style={{ width: 'auto' }} value={l.effectiveness} disabled={busy === l.id}
                        aria-label="Effectiveness" onChange={e => setEffectiveness(l, e.target.value as ControlEffectiveness)}>
                        {CONTROL_EFFECTIVENESS.map(v => <option key={v} value={v}>{CONTROL_EFFECTIVENESS_LABELS[v]}</option>)}
                      </select>
                    ) : <Pill tone={EFF_TONE[l.effectiveness]}>{CONTROL_EFFECTIVENESS_LABELS[l.effectiveness]}</Pill>}
                    {busy === l.id && <Loader2 size={14} className="animate-spin" />}
                    {editable && (
                      <button type="button" className="btn-ghost btn-sm no-print" disabled={togglingCritical === l.control_id}
                        onClick={() => toggleSafetyCritical(l.control_id, !(library.find(c => c.id === l.control_id)?.safety_critical))}>
                        {togglingCritical === l.control_id && <Loader2 size={12} className="animate-spin" />}
                        {library.find(c => c.id === l.control_id)?.safety_critical ? 'Unmark critical' : 'Mark safety-critical'}
                      </button>
                    )}
                    {editable && (
                      <button type="button" className="btn-icon no-print" aria-label="Remove control" disabled={busy === l.id} onClick={() => unlink(l)}><X size={14} /></button>
                    )}
                    <div className="w-full text-xs flex flex-wrap gap-2 items-center" style={{ color: 'var(--ink-faint)' }}>
                      {l.effectiveness_recorded_at && <span>Effectiveness recorded by {who(l.effectiveness_recorded_by)} · {new Date(l.effectiveness_recorded_at).toLocaleDateString('en-GB')}</span>}
                      {canRecord ? (
                        <input className="input text-xs flex-1 min-w-[200px]" defaultValue={l.notes ?? ''} maxLength={1000} placeholder="Note on this control (optional)"
                          onBlur={e => saveNotes(l, e.target.value)} />
                      ) : l.notes && <span>{l.notes}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {editable && !adding && (
        <button type="button" className="btn-secondary btn-sm no-print" onClick={() => setAdding(true)}><Plus size={14} /> Attach control</button>
      )}
      {editable && adding && (
        <form onSubmit={link} className="grid gap-3 sm:grid-cols-2 p-3 rounded no-print" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}>
          <div className="sm:col-span-2 flex gap-2">
            <button type="button" className={!newMode ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setCreating(false)} disabled={library.length === 0}>From the control library</button>
            <button type="button" className={newMode ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setCreating(true)}>New control</button>
          </div>
          {newMode ? (
            <>
              <label className="block sm:col-span-2"><span className="label">Control</span>
                <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)} maxLength={200} required placeholder="e.g. Guard fitted to the conveyor nip point" /></label>
              <label className="block"><span className="label">Hierarchy of control</span>
                <select className="input" value={newType} onChange={e => setNewType(e.target.value as ControlType)}>
                  {CONTROL_TYPES.map(t => <option key={t} value={t}>{CONTROL_TYPE_LABELS[t]}</option>)}
                </select></label>
              <label className="flex items-center gap-2 text-sm self-end" style={{ minHeight: 40 }}>
                <input type="checkbox" checked={newVerify} onChange={e => setNewVerify(e.target.checked)} /> Needs verifying on site
              </label>
              <label className="flex items-center gap-2 text-sm self-end sm:col-span-2" style={{ minHeight: 40 }}>
                <input type="checkbox" checked={newSafetyCritical} onChange={e => setNewSafetyCritical(e.target.checked)} /> Safety-critical control
              </label>
              <label className="block sm:col-span-2"><span className="label">Description (optional)</span>
                <input className="input" value={newDesc} onChange={e => setNewDesc(e.target.value)} maxLength={2000} /></label>
              <p className="sm:col-span-2 text-xs" style={{ color: 'var(--ink-faint)' }}>The control is added to this organisation&apos;s control library so it can be reused.</p>
            </>
          ) : (
            <label className="block sm:col-span-2"><span className="label">Control</span>
              <select className="input" value={controlId} onChange={e => setControlId(e.target.value)} required>
                <option value="">Choose…</option>
                {CONTROL_TYPES.map(t => {
                  const cs = library.filter(c => c.control_type === t);
                  return cs.length ? (
                    <optgroup key={t} label={CONTROL_TYPE_LABELS[t]}>
                      {cs.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select></label>
          )}
          <label className="block"><span className="label">Stage</span>
            <select className="input" value={stage} onChange={e => setStage(e.target.value as ControlStage)}>
              {CONTROL_STAGES.map(s => <option key={s} value={s}>{s === 'existing' ? 'Existing — already in place' : 'Additional — further control to put in place'}</option>)}
            </select></label>
          <label className="block"><span className="label">Effectiveness</span>
            <select className="input" value={eff} onChange={e => setEff(e.target.value as ControlEffectiveness)}>
              {CONTROL_EFFECTIVENESS.map(v => <option key={v} value={v}>{CONTROL_EFFECTIVENESS_LABELS[v]}</option>)}
            </select></label>
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-cta btn-sm" disabled={busy === 'add' || (newMode ? !newTitle.trim() : !controlId)}>
              {busy === 'add' && <Loader2 size={14} className="animate-spin" />} Attach
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setAdding(false); setCreating(false); }}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
