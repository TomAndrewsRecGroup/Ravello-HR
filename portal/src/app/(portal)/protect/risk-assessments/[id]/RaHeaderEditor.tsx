'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import type { Person, RaRow } from './raTypes';

type Fields = Pick<RaRow, 'title' | 'assessment_type_id' | 'activity_or_process' | 'description' | 'site_id' | 'department_id'
  | 'assessor_id' | 'responsible_manager_id' | 'assessment_date' | 'review_date'>;

// Assessment details, editable only while the version is a draft or has
// changes requested (the page shows this only then; hs_doc_guard is the
// gate). Conditional on the row_version the page rendered, so two people
// editing the same draft cannot silently overwrite each other.
export default function RaHeaderEditor({ ra, types, sites, departments, people }: {
  ra: RaRow;
  types: { id: string; name: string }[];
  sites: { id: string; name: string }[];
  departments: { id: string; name: string; site_id: string | null }[];
  people: Person[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Fields>({
    title: ra.title, assessment_type_id: ra.assessment_type_id, activity_or_process: ra.activity_or_process, description: ra.description,
    site_id: ra.site_id, department_id: ra.department_id, assessor_id: ra.assessor_id, responsible_manager_id: ra.responsible_manager_id,
    assessment_date: ra.assessment_date, review_date: ra.review_date,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF(p => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.review_date && f.review_date < f.assessment_date) { setMsg({ ok: false, text: 'The review date cannot be before the assessment date.' }); return; }
    setBusy(true); setMsg(null);
    const res = await createClient().from('risk_assessments').update({
      title: f.title.trim(), assessment_type_id: f.assessment_type_id || null, activity_or_process: f.activity_or_process?.trim() || null,
      description: f.description?.trim() || null, site_id: f.site_id || null, department_id: f.department_id || null,
      assessor_id: f.assessor_id || null, responsible_manager_id: f.responsible_manager_id || null,
      assessment_date: f.assessment_date, review_date: f.review_date || null,
    }, COUNT_EXACT).eq('id', ra.id).eq('row_version', ra.row_version);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The assessment');
    if (!out.ok) {
      setMsg({ ok: false, text: res.count === 0 && !res.error ? 'Someone else changed this assessment since you opened it. Refresh to see their change.' : out.message! });
      return;
    }
    setMsg({ ok: true, text: 'Saved.' });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="no-print flex items-center gap-3">
        <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>Edit assessment details</button>
        {msg && <span className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</span>}
      </div>
    );
  }

  const opt = (p: Person) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>;
  return (
    <form onSubmit={save} className="card p-5 space-y-3 no-print">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Assessment details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="label">Title</span>
          <input className="input" value={f.title} onChange={e => set('title', e.target.value)} maxLength={200} required /></label>
        <label className="block"><span className="label">Assessment type</span>
          <select className="input" value={f.assessment_type_id ?? ''} onChange={e => set('assessment_type_id', e.target.value || null)}>
            <option value="">Not set</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <label className="block"><span className="label">Site</span>
          <select className="input" value={f.site_id ?? ''} onChange={e => { set('site_id', e.target.value || null); set('department_id', null); }}>
            <option value="">Not site-specific</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label className="block"><span className="label">Department / area</span>
          <select className="input" value={f.department_id ?? ''} onChange={e => set('department_id', e.target.value || null)}>
            <option value="">Not set</option>
            {departments.filter(d => !f.site_id || !d.site_id || d.site_id === f.site_id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></label>
        <label className="block"><span className="label">Assessor</span>
          <select className="input" value={f.assessor_id ?? ''} onChange={e => set('assessor_id', e.target.value || null)}>
            <option value="">Not named yet</option>{people.map(opt)}
          </select></label>
        <label className="block sm:col-span-2"><span className="label">Activity or process assessed</span>
          <input className="input" value={f.activity_or_process ?? ''} onChange={e => set('activity_or_process', e.target.value)} maxLength={1000} /></label>
        <label className="block sm:col-span-2"><span className="label">Scope and description</span>
          <textarea className="input" rows={3} value={f.description ?? ''} onChange={e => set('description', e.target.value)} maxLength={8000} /></label>
        <label className="block"><span className="label">Responsible manager</span>
          <select className="input" value={f.responsible_manager_id ?? ''} onChange={e => set('responsible_manager_id', e.target.value || null)}>
            <option value="">Not named yet</option>{people.map(opt)}
          </select></label>
        <label className="block"><span className="label">Assessment date</span>
          <input className="input" type="date" value={f.assessment_date} onChange={e => set('assessment_date', e.target.value)} required /></label>
        <label className="block"><span className="label">Review date</span>
          <input className="input" type="date" value={f.review_date ?? ''} min={f.assessment_date} onChange={e => set('review_date', e.target.value || null)} /></label>
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>The risk matrix is fixed once the assessment is created, so the ratings it holds always mean the same thing.</p>
      <div className="flex items-center gap-3">
        <button className="btn-cta btn-sm" disabled={busy || !f.title.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} Save details</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        {msg && <span className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</span>}
      </div>
    </form>
  );
}
