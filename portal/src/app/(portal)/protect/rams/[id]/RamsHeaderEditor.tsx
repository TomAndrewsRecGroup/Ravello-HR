'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { RAMS_SECTION_KEYS, RAMS_SECTION_LABELS, type RamsSectionKey } from '@/lib/hs/safetyVocab';
import { RAMS_CONDITIONAL_SECTIONS } from '@/lib/hs/ramsSectionQuestions';

export interface RamsHeader {
  id: string; row_version: number; title: string; project_name: string | null; description: string | null;
  scope_of_work: string | null; site_id: string | null; department_id: string | null; start_date: string | null;
  end_date: string | null; review_date: string | null; author_id: string | null; responsible_manager_id: string | null;
  sections: Partial<Record<RamsSectionKey, string | null>>;
}

// The editable part of a draft RAMS: header and the structured sections
// (none mandatory). Only non-empty sections are saved; the database
// validates the section keys and lengths (hs_rams_sections_valid). The
// save is conditional on the rendered row_version.
export default function RamsHeaderEditor({ ms, people, sites, departments }: {
  ms: RamsHeader;
  people: { user_id: string; full_name: string }[];
  sites: { id: string; name: string }[];
  departments: { id: string; name: string; site_id: string | null }[];
}) {
  const router = useRouter();
  const [f, setF] = useState(ms);
  const [sections, setSections] = useState<Partial<Record<RamsSectionKey, string>>>(
    Object.fromEntries(RAMS_SECTION_KEYS.map(k => [k, ms.sections[k] ?? ''])));
  const [shown, setShown] = useState<RamsSectionKey[]>(RAMS_SECTION_KEYS.filter(k => (ms.sections[k] ?? '').trim()));
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [suggested, setSuggested] = useState<RamsSectionKey[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const set = <K extends keyof RamsHeader>(k: K, v: RamsHeader[K]) => setF(p => ({ ...p, [k]: v }));
  const t = (v: string | null) => (v ?? '').trim() || null;

  async function save() {
    setBusy(true); setMsg(null);
    const cleanSections: Record<string, string> = {};
    for (const k of RAMS_SECTION_KEYS) {
      const v = (sections[k] ?? '').trim();
      if (v) cleanSections[k] = v;
    }
    const res = await createClient().from('method_statements').update({
      title: f.title.trim(), project_name: t(f.project_name), description: t(f.description), scope_of_work: t(f.scope_of_work),
      site_id: f.site_id, department_id: f.department_id, start_date: f.start_date || null, end_date: f.end_date || null,
      review_date: f.review_date || null, author_id: f.author_id, responsible_manager_id: f.responsible_manager_id,
      sections: cleanSections,
    }, COUNT_EXACT).eq('id', ms.id).eq('row_version', ms.row_version);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The method statement');
    if (!out.ok) {
      setMsg({ ok: false, text: res.count === 0 && !res.error ? 'Someone else changed this method statement since you opened it. Refresh to see their change.' : out.message! });
      return;
    }
    setMsg({ ok: true, text: 'Saved.' });
    router.refresh();
  }

  // Core-OS 360 Phase 15: Intelligent RAMS. Never writes section
  // CONTENT — Jev cannot draft free text, only flag which of the six
  // conditional sections (lib/hs/ramsSectionQuestions.ts) likely need
  // real content for THIS scope of work. A flagged section is simply
  // revealed (its empty textarea shown, exactly like clicking "Add
  // section" by hand) with a small note until the author types
  // something into it; nothing is pre-filled.
  async function suggestSections() {
    setSuggesting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/protect/jev/rams-section', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: f.title, project_name: f.project_name, scope_of_work: f.scope_of_work ?? '' }),
      });
      const body = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: body.error ?? 'Could not get a suggestion.' }); return; }
      const keys = (body.suggested_sections ?? []) as RamsSectionKey[];
      setSuggested(keys);
      setShown(s => RAMS_SECTION_KEYS.filter(k => s.includes(k) || keys.includes(k)));
      setMsg(keys.length > 0
        ? { ok: true, text: `Worth checking: ${keys.map(k => RAMS_SECTION_LABELS[k]).join(', ')}.` }
        : { ok: true, text: body.reason === 'unavailable' ? 'Suggestions are unavailable right now.' : 'No additional sections suggested.' });
    } finally {
      setSuggesting(false);
    }
  }

  const remaining = RAMS_SECTION_KEYS.filter(k => !shown.includes(k));

  return (
    <section className="card p-5 space-y-4 no-print">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Details</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block sm:col-span-2"><span className="label">Title</span>
          <input className="input" value={f.title} onChange={e => set('title', e.target.value)} maxLength={200} required /></label>
        <label className="block"><span className="label">Project / client job</span>
          <input className="input" value={f.project_name ?? ''} onChange={e => set('project_name', e.target.value)} maxLength={200} /></label>
        <label className="block"><span className="label">Site</span>
          <select className="input" value={f.site_id ?? ''} onChange={e => set('site_id', e.target.value || null)}>
            <option value="">Not set</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="block"><span className="label">Department / area</span>
          <select className="input" value={f.department_id ?? ''} onChange={e => set('department_id', e.target.value || null)}>
            <option value="">Not set</option>
            {departments.filter(d => !f.site_id || !d.site_id || d.site_id === f.site_id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></label>
        <label className="block"><span className="label">Author</span>
          <select className="input" value={f.author_id ?? ''} onChange={e => set('author_id', e.target.value || null)}>
            <option value="">Not set</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
        <label className="block"><span className="label">Responsible manager</span>
          <select className="input" value={f.responsible_manager_id ?? ''} onChange={e => set('responsible_manager_id', e.target.value || null)}>
            <option value="">Not set</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
        <label className="block"><span className="label">Work starts</span>
          <input className="input" type="date" value={f.start_date ?? ''} onChange={e => set('start_date', e.target.value || null)} /></label>
        <label className="block"><span className="label">Work ends</span>
          <input className="input" type="date" value={f.end_date ?? ''} min={f.start_date ?? undefined} onChange={e => set('end_date', e.target.value || null)} /></label>
        <label className="block"><span className="label">Review date (needed to submit)</span>
          <input className="input" type="date" value={f.review_date ?? ''} onChange={e => set('review_date', e.target.value || null)} /></label>
      </div>
      <label className="block"><span className="label">Description</span>
        <textarea className="input" rows={3} value={f.description ?? ''} onChange={e => set('description', e.target.value)} maxLength={8000} /></label>
      <label className="block"><span className="label">Scope of work</span>
        <textarea className="input" rows={3} value={f.scope_of_work ?? ''} onChange={e => set('scope_of_work', e.target.value)} maxLength={8000} /></label>

      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink-soft)' }}>Sections</h3>
          <button type="button" className="btn-secondary btn-sm" disabled={suggesting || !f.title.trim()} onClick={suggestSections}>
            {suggesting && <Loader2 size={14} className="animate-spin" />} Suggest sections to check
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Add only the sections this work needs. Empty sections are not saved.</p>
        {shown.map(k => (
          <label key={k} className="block"><span className="label">{RAMS_SECTION_LABELS[k]}</span>
            {suggested.includes(k) && !(sections[k] ?? '').trim() && RAMS_CONDITIONAL_SECTIONS.includes(k) && (
              <span className="block text-xs mb-1" style={{ color: 'var(--gold)' }}>Worth checking for this scope of work.</span>
            )}
            <textarea className="input" rows={3} value={sections[k] ?? ''} maxLength={8000}
              onChange={e => setSections(p => ({ ...p, [k]: e.target.value }))} />
          </label>
        ))}
        {remaining.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="label">Add a section</span>
              <select className="input" value={adding} onChange={e => setAdding(e.target.value)}>
                <option value="">Choose…</option>{remaining.map(k => <option key={k} value={k}>{RAMS_SECTION_LABELS[k]}</option>)}</select></label>
            <button type="button" className="btn-secondary btn-sm" disabled={!adding}
              onClick={() => { setShown(s => RAMS_SECTION_KEYS.filter(k => s.includes(k) || k === adding)); setAdding(''); }}>Add section</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-cta btn-sm" onClick={save} disabled={busy || !f.title.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
        {msg && <span className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</span>}
      </div>
    </section>
  );
}
