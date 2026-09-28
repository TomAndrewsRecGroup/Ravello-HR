'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { EXPOSURE_ROUTES, EXPOSURE_ROUTE_LABELS, PERSONS_AT_RISK, PERSONS_AT_RISK_LABELS } from '@/lib/hs/safetyVocab';

export interface CoshhDraft {
  id: string; row_version: number; title: string; site_id: string | null; department_id: string | null;
  task_or_process: string | null; exposure_routes: string[]; persons_exposed: string[]; persons_exposed_notes: string | null;
  frequency: string | null; duration: string | null; quantity: string | null; existing_controls: string | null; ppe: string | null;
  first_aid: string | null; spill_response: string | null; disposal: string | null; health_surveillance_required: boolean;
  exposure_monitoring_required: boolean; emergency_arrangements: string | null; assessor_id: string | null;
  responsible_manager_id: string | null; assessment_date: string; review_date: string | null;
}

type TextKey = 'task_or_process' | 'persons_exposed_notes' | 'frequency' | 'duration' | 'quantity' | 'existing_controls' | 'ppe'
  | 'first_aid' | 'spill_response' | 'disposal' | 'emergency_arrangements';

// The content of a draft COSHH assessment. The save is conditional on
// the rendered row_version; hs_doc_guard checks every reference belongs
// to this organisation. Exposure routes and who is exposed are needed
// before it can be submitted (hs_doc_ready).
export default function CoshhEditor({ doc, people, sites, departments }: {
  doc: CoshhDraft;
  people: { user_id: string; full_name: string }[];
  sites: { id: string; name: string }[];
  departments: { id: string; name: string; site_id: string | null }[];
}) {
  const router = useRouter();
  const [f, setF] = useState(doc);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof CoshhDraft>(k: K, v: CoshhDraft[K]) => setF(p => ({ ...p, [k]: v }));
  const toggle = (k: 'exposure_routes' | 'persons_exposed', v: string) =>
    setF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }));
  const t = (v: string | null) => (v ?? '').trim() || null;

  async function save() {
    setBusy(true); setMsg(null);
    const res = await createClient().from('coshh_assessments').update({
      title: f.title.trim(), site_id: f.site_id, department_id: f.department_id, task_or_process: t(f.task_or_process),
      exposure_routes: f.exposure_routes, persons_exposed: f.persons_exposed, persons_exposed_notes: t(f.persons_exposed_notes),
      frequency: t(f.frequency), duration: t(f.duration), quantity: t(f.quantity), existing_controls: t(f.existing_controls),
      ppe: t(f.ppe), first_aid: t(f.first_aid), spill_response: t(f.spill_response), disposal: t(f.disposal),
      health_surveillance_required: f.health_surveillance_required, exposure_monitoring_required: f.exposure_monitoring_required,
      emergency_arrangements: t(f.emergency_arrangements), assessor_id: f.assessor_id, responsible_manager_id: f.responsible_manager_id,
      assessment_date: f.assessment_date, review_date: f.review_date || null,
    }, COUNT_EXACT).eq('id', doc.id).eq('row_version', doc.row_version);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The COSHH assessment');
    if (!out.ok) {
      setMsg({ ok: false, text: res.count === 0 && !res.error ? 'Someone else changed this assessment since you opened it. Refresh to see their change.' : out.message! });
      return;
    }
    setMsg({ ok: true, text: 'Saved.' });
    router.refresh();
  }

  const area = (k: TextKey, label: string, max: number, rows = 3) => (
    <label className="block"><span className="label">{label}</span>
      <textarea className="input" rows={rows} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} maxLength={max} /></label>
  );
  const line = (k: TextKey, label: string, placeholder?: string) => (
    <label className="block"><span className="label">{label}</span>
      <input className="input" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} maxLength={200} placeholder={placeholder} /></label>
  );

  return (
    <section className="card p-5 space-y-4 no-print">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Assessment</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block sm:col-span-2"><span className="label">Title</span>
          <input className="input" value={f.title} onChange={e => set('title', e.target.value)} maxLength={200} required /></label>
        <label className="block"><span className="label">Site</span>
          <select className="input" value={f.site_id ?? ''} onChange={e => set('site_id', e.target.value || null)}>
            <option value="">Not set</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="block"><span className="label">Department / area</span>
          <select className="input" value={f.department_id ?? ''} onChange={e => set('department_id', e.target.value || null)}>
            <option value="">Not set</option>
            {departments.filter(d => !f.site_id || !d.site_id || d.site_id === f.site_id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></label>
        <label className="block"><span className="label">Assessor</span>
          <select className="input" value={f.assessor_id ?? ''} onChange={e => set('assessor_id', e.target.value || null)}>
            <option value="">Not set</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
        <label className="block"><span className="label">Responsible manager</span>
          <select className="input" value={f.responsible_manager_id ?? ''} onChange={e => set('responsible_manager_id', e.target.value || null)}>
            <option value="">Not set</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
        <label className="block"><span className="label">Assessment date</span>
          <input className="input" type="date" value={f.assessment_date} onChange={e => set('assessment_date', e.target.value)} required /></label>
        <label className="block"><span className="label">Review date (needed to submit)</span>
          <input className="input" type="date" value={f.review_date ?? ''} min={f.assessment_date} onChange={e => set('review_date', e.target.value || null)} /></label>
      </div>

      {area('task_or_process', 'Task or process — how the substance is used', 2000)}

      <fieldset>
        <legend className="label">Exposure routes</legend>
        <div className="flex flex-wrap gap-2">
          {EXPOSURE_ROUTES.map(r => (
            <label key={r} className="flex items-center gap-2 text-sm px-3 rounded" style={{ minHeight: 44, border: '1px solid var(--line)' }}>
              <input type="checkbox" checked={f.exposure_routes.includes(r)} onChange={() => toggle('exposure_routes', r)} /> {EXPOSURE_ROUTE_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Persons exposed</legend>
        <div className="flex flex-wrap gap-2">
          {PERSONS_AT_RISK.map(p => (
            <label key={p} className="flex items-center gap-2 text-sm px-3 rounded" style={{ minHeight: 44, border: '1px solid var(--line)' }}>
              <input type="checkbox" checked={f.persons_exposed.includes(p)} onChange={() => toggle('persons_exposed', p)} /> {PERSONS_AT_RISK_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      {area('persons_exposed_notes', 'Notes on who is exposed (optional)', 1000, 2)}

      <div className="grid gap-3 sm:grid-cols-3">
        {line('frequency', 'Frequency', 'e.g. Daily')}
        {line('duration', 'Duration', 'e.g. Up to 2 hours per shift')}
        {line('quantity', 'Quantity', 'e.g. 5 litres per week')}
      </div>

      {area('existing_controls', 'Existing controls (describe; link controls from the library below)', 4000)}
      <div className="grid gap-3 sm:grid-cols-2">
        {area('ppe', 'PPE / RPE', 2000)}
        {area('first_aid', 'First aid', 2000)}
        {area('spill_response', 'Spill response', 2000)}
        {area('disposal', 'Disposal', 2000)}
      </div>
      {area('emergency_arrangements', 'Emergency arrangements', 2000)}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={f.health_surveillance_required} onChange={e => set('health_surveillance_required', e.target.checked)} /> Health surveillance required
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={f.exposure_monitoring_required} onChange={e => set('exposure_monitoring_required', e.target.checked)} /> Exposure monitoring required
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-cta btn-sm" onClick={save} disabled={busy || !f.title.trim() || !f.assessment_date}>
          {busy && <Loader2 size={14} className="animate-spin" />} Save
        </button>
        {msg && <span className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</span>}
      </div>
    </section>
  );
}
