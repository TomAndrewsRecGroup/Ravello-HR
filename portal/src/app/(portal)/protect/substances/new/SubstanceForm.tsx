'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { GHS_PICTOGRAMS, GHS_PICTOGRAM_LABELS, SUBSTANCE_STATUSES, SUBSTANCE_TYPES, humanise, type GhsPictogram } from '@/lib/hs/safetyVocab';

export interface SubstanceValues {
  product_name: string; manufacturer: string | null; supplier: string | null; product_code: string | null; substance_type: string | null;
  hazard_statements: string[]; precautionary_statements: string[]; pictograms: GhsPictogram[];
  storage_requirements: string | null; disposal_requirements: string | null; emergency_information: string | null; active_status: string;
}

const EMPTY: SubstanceValues = {
  product_name: '', manufacturer: null, supplier: null, product_code: null, substance_type: null, hazard_statements: [],
  precautionary_statements: [], pictograms: [], storage_requirements: null, disposal_requirements: null, emergency_information: null,
  active_status: 'active',
};

const lines = (v: string) => v.split('\n').map(x => x.trim()).filter(Boolean);
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

// Add or edit a substance on the COSHH register (124). The SDS version
// and date are the database's, taken from the current safety data sheet
// — never typed here. Pictograms are recorded only with a person's
// explicit confirmation that they checked them against the SDS; the
// database stamps who and when (hs_substance_guard).
export default function SubstanceForm({ companyId, substance }: {
  companyId: string;
  /** Present when editing. */
  substance?: { id: string; row_version: number } & SubstanceValues;
}) {
  const router = useRouter();
  const initial = substance ?? EMPTY;
  const [f, setF] = useState<SubstanceValues>(initial);
  const [hazards, setHazards] = useState(initial.hazard_statements.join('\n'));
  const [precautions, setPrecautions] = useState(initial.precautionary_statements.join('\n'));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof SubstanceValues>(k: K, v: SubstanceValues[K]) => setF(p => ({ ...p, [k]: v }));
  const t = (v: string | null) => (v ?? '').trim() || null;
  const pictogramsChanged = !sameSet(f.pictograms, initial.pictograms);
  const needConfirm = pictogramsChanged && f.pictograms.length > 0;

  function togglePictogram(p: GhsPictogram) {
    setF(prev => ({ ...prev, pictograms: prev.pictograms.includes(p) ? prev.pictograms.filter(x => x !== p) : GHS_PICTOGRAMS.filter(x => x === p || prev.pictograms.includes(x)) }));
    setConfirmed(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needConfirm && !confirmed) { setMsg({ ok: false, text: 'Confirm you have checked the pictograms against the safety data sheet.' }); return; }
    setBusy(true); setMsg(null);
    const values = {
      product_name: f.product_name.trim(), manufacturer: t(f.manufacturer), supplier: t(f.supplier), product_code: t(f.product_code),
      substance_type: f.substance_type || null, hazard_statements: lines(hazards), precautionary_statements: lines(precautions),
      pictograms: f.pictograms, storage_requirements: t(f.storage_requirements), disposal_requirements: t(f.disposal_requirements),
      emergency_information: t(f.emergency_information),
    };
    const sb = createClient();
    if (!substance) {
      const { data, error } = await sb.from('substances').insert({ company_id: companyId, ...values }).select('id').single();
      setBusy(false);
      if (error || !data) { setMsg({ ok: false, text: error?.message ?? 'The substance could not be added.' }); return; }
      router.push(`/protect/substances/${data.id as string}`);
      return;
    }
    const res = await sb.from('substances').update({ ...values, active_status: f.active_status }, COUNT_EXACT)
      .eq('id', substance.id).eq('row_version', substance.row_version);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The substance');
    if (!out.ok) {
      setMsg({ ok: false, text: res.count === 0 && !res.error ? 'Someone else changed this substance since you opened it. Refresh to see their change.' : out.message! });
      return;
    }
    setConfirmed(false);
    setMsg({ ok: true, text: 'Saved.' });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="label">Product name</span>
          <input className="input" value={f.product_name} onChange={e => set('product_name', e.target.value)} maxLength={200} required /></label>
        <label className="block"><span className="label">Manufacturer</span>
          <input className="input" value={f.manufacturer ?? ''} onChange={e => set('manufacturer', e.target.value)} maxLength={200} /></label>
        <label className="block"><span className="label">Supplier</span>
          <input className="input" value={f.supplier ?? ''} onChange={e => set('supplier', e.target.value)} maxLength={200} /></label>
        <label className="block"><span className="label">Product code</span>
          <input className="input" value={f.product_code ?? ''} onChange={e => set('product_code', e.target.value)} maxLength={100} /></label>
        <label className="block"><span className="label">Type</span>
          <select className="input" value={f.substance_type ?? ''} onChange={e => set('substance_type', e.target.value || null)}>
            <option value="">Not set</option>{SUBSTANCE_TYPES.map(s => <option key={s} value={s}>{humanise(s)}</option>)}</select></label>
        {substance && (
          <label className="block"><span className="label">Register status</span>
            <select className="input" value={f.active_status} onChange={e => set('active_status', e.target.value)}>
              {SUBSTANCE_STATUSES.map(s => <option key={s} value={s}>{humanise(s)}</option>)}</select></label>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="label">GHS hazard pictograms (from section 2 of the SDS)</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {GHS_PICTOGRAMS.map(p => (
            <label key={p} className="flex items-center gap-2 text-sm px-3 rounded" style={{ minHeight: 44, border: '1px solid var(--line)' }}>
              <input type="checkbox" checked={f.pictograms.includes(p)} onChange={() => togglePictogram(p)} />
              <span className="font-mono text-xs">{p}</span> {GHS_PICTOGRAM_LABELS[p]}
            </label>
          ))}
        </div>
        {needConfirm && (
          <label className="flex items-start gap-2 text-sm p-3 rounded" style={{ background: 'var(--surface-soft)', color: 'var(--ink)' }}>
            <input type="checkbox" className="mt-1" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            I have checked these pictograms against the current safety data sheet for this product.
          </label>
        )}
        {pictogramsChanged && f.pictograms.length === 0 && initial.pictograms.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--gold)' }}>All pictograms will be removed. Your name is recorded against the change.</p>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Hazard statements (one per line, e.g. H315 Causes skin irritation)</span>
          <textarea className="input" rows={4} value={hazards} onChange={e => setHazards(e.target.value)} /></label>
        <label className="block"><span className="label">Precautionary statements (one per line)</span>
          <textarea className="input" rows={4} value={precautions} onChange={e => setPrecautions(e.target.value)} /></label>
        <label className="block"><span className="label">Storage requirements</span>
          <textarea className="input" rows={2} value={f.storage_requirements ?? ''} onChange={e => set('storage_requirements', e.target.value)} maxLength={2000} /></label>
        <label className="block"><span className="label">Disposal requirements</span>
          <textarea className="input" rows={2} value={f.disposal_requirements ?? ''} onChange={e => set('disposal_requirements', e.target.value)} maxLength={2000} /></label>
        <label className="block sm:col-span-2"><span className="label">Emergency information</span>
          <textarea className="input" rows={2} value={f.emergency_information ?? ''} onChange={e => set('emergency_information', e.target.value)} maxLength={2000} /></label>
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        Recording these details does not establish compliance. The SDS version and date come from the safety data sheets you upload.
      </p>
      {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      <button className="btn-cta" style={{ minHeight: 44 }} disabled={busy || !f.product_name.trim() || (needConfirm && !confirmed)}>
        {busy && <Loader2 size={16} className="animate-spin" />} {substance ? 'Save substance' : 'Add substance'}
      </button>
    </form>
  );
}
