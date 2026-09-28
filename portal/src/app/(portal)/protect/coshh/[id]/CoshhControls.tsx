'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  CONTROL_CATEGORIES, CONTROL_CATEGORY_LABELS, CONTROL_EFFECTIVENESS, CONTROL_EFFECTIVENESS_LABELS, CONTROL_TYPES, CONTROL_TYPE_LABELS,
  type ControlCategory, type ControlEffectiveness, type ControlType,
} from '@/lib/hs/safetyVocab';
import Pill from '@/components/safety/Pill';

export interface CoshhControlRow { id: string; control_id: string; control_title: string; control_type: ControlType;
  control_category: ControlCategory | null; effectiveness: ControlEffectiveness; effectiveness_at: string | null; notes: string | null }
export interface LibraryControl { id: string; title: string; control_type: ControlType; category: ControlCategory | null }

const EFF_TONE: Record<ControlEffectiveness, 'good' | 'warn' | 'bad' | 'neutral'> = {
  in_place: 'good', partially_implemented: 'warn', ineffective: 'bad', not_implemented: 'bad', verification_required: 'neutral',
};

// Controls for a COSHH assessment, linked from the organisation's
// control library (123) and shown in the hierarchy of control. A linked
// control is never presumed effective: it starts as "verification
// required" and a person records its effectiveness (stamped by the
// database, hs_coshh_control_guard).
export default function CoshhControls({ coshhId, companyId, rows, library, canLink, canRate }: {
  coshhId: string; companyId: string; rows: CoshhControlRow[]; library: LibraryControl[];
  /** Draft / changes requested and risk.create: link, unlink, add to library. */
  canLink: boolean;
  /** As above, or a reviewer during pending review. */
  canRate: boolean;
}) {
  const router = useRouter();
  const [pick, setPick] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [nc, setNc] = useState<{ title: string; control_type: ControlType; category: string }>({ title: '', control_type: 'engineering', category: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => CONTROL_TYPES.indexOf(a.control_type) - CONTROL_TYPES.indexOf(b.control_type) || a.control_title.localeCompare(b.control_title));
  const linked = new Set(rows.map(r => r.control_id));
  const available = library.filter(c => !linked.has(c.id));

  async function link(controlId: string) {
    setBusy(true); setError(null);
    const { error: err } = await createClient().from('coshh_assessment_controls').insert({
      coshh_assessment_id: coshhId, company_id: companyId, control_id: controlId,
    });
    setBusy(false);
    if (err) { setError(err.message); return false; }
    setPick('');
    router.refresh();
    return true;
  }

  async function createAndLink() {
    setBusy(true); setError(null);
    const { data, error: err } = await createClient().from('controls').insert({
      company_id: companyId, title: nc.title.trim(), control_type: nc.control_type, category: nc.category || null,
    }).select('id').single();
    setBusy(false);
    if (err || !data) { setError(err?.message ?? 'The control could not be added.'); return; }
    if (await link(data.id as string)) { setNewOpen(false); setNc({ title: '', control_type: 'engineering', category: '' }); }
  }

  async function unlink(id: string) {
    setBusy(true); setError(null);
    const { error: err, count } = await createClient().from('coshh_assessment_controls').delete({ count: 'exact' }).eq('id', id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (count === 0) { setError('The control was not removed. You may not have permission.'); return; }
    router.refresh();
  }

  async function rate(id: string, effectiveness: ControlEffectiveness) {
    setBusy(true); setError(null);
    const res = await createClient().from('coshh_assessment_controls').update({ effectiveness }, COUNT_EXACT).eq('id', id);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The effectiveness');
    if (!out.ok) { setError(out.message); return; }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No controls linked yet.</p> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Control</th><th>Hierarchy</th><th>Category</th><th>Effectiveness</th>{canLink && <th />}</tr></thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--ink)' }}>{r.control_title}</td>
                  <td>{CONTROL_TYPE_LABELS[r.control_type]}</td>
                  <td>{r.control_category ? CONTROL_CATEGORY_LABELS[r.control_category] : '—'}</td>
                  <td>
                    {canRate ? (
                      <select className="input" value={r.effectiveness} disabled={busy} onChange={e => rate(r.id, e.target.value as ControlEffectiveness)}
                        aria-label={`Effectiveness of ${r.control_title}`}>
                        {CONTROL_EFFECTIVENESS.map(v => <option key={v} value={v}>{CONTROL_EFFECTIVENESS_LABELS[v]}</option>)}
                      </select>
                    ) : <Pill tone={EFF_TONE[r.effectiveness]}>{CONTROL_EFFECTIVENESS_LABELS[r.effectiveness]}</Pill>}
                  </td>
                  {canLink && (
                    <td><button type="button" className="btn-icon" aria-label="Remove control" onClick={() => unlink(r.id)} disabled={busy}><X size={13} /></button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canLink && (
        <div className="space-y-2 no-print">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block flex-1 min-w-[220px]"><span className="label">Link a control from the library</span>
              <select className="input" value={pick} onChange={e => setPick(e.target.value)}>
                <option value="">Choose…</option>
                {CONTROL_TYPES.map(t => {
                  const opts = available.filter(c => c.control_type === t);
                  return opts.length ? (
                    <optgroup key={t} label={CONTROL_TYPE_LABELS[t]}>
                      {opts.map(c => <option key={c.id} value={c.id}>{c.title}{c.category ? ` (${CONTROL_CATEGORY_LABELS[c.category]})` : ''}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
            <button type="button" className="btn-secondary btn-sm" onClick={() => link(pick)} disabled={busy || !pick}>
              {busy && <Loader2 size={14} className="animate-spin" />} Link
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setNewOpen(o => !o)}>New control</button>
          </div>
          {newOpen && (
            <div className="grid gap-2 sm:grid-cols-3 items-end p-3 rounded" style={{ background: 'var(--surface-soft)' }}>
              <label className="block sm:col-span-3"><span className="label">Control</span>
                <input className="input" value={nc.title} onChange={e => setNc(p => ({ ...p, title: e.target.value }))} maxLength={200}
                  placeholder="e.g. Local exhaust ventilation at the mixing bench" /></label>
              <label className="block"><span className="label">Hierarchy</span>
                <select className="input" value={nc.control_type} onChange={e => setNc(p => ({ ...p, control_type: e.target.value as ControlType }))}>
                  {CONTROL_TYPES.map(t => <option key={t} value={t}>{CONTROL_TYPE_LABELS[t]}</option>)}</select></label>
              <label className="block"><span className="label">COSHH category</span>
                <select className="input" value={nc.category} onChange={e => setNc(p => ({ ...p, category: e.target.value }))}>
                  <option value="">None</option>{CONTROL_CATEGORIES.map(c => <option key={c} value={c}>{CONTROL_CATEGORY_LABELS[c]}</option>)}</select></label>
              <button type="button" className="btn-cta btn-sm" onClick={createAndLink} disabled={busy || !nc.title.trim()}>Add to library and link</button>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
