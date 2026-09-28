'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { docPath } from '@/lib/hs/safetyVocab';

type Kind = 'method_statement' | 'coshh_assessment';
export interface TemplateOption { id: string; title: string; description: string | null; visibility: string }

// Start a RAMS or COSHH assessment: blank, or from a visible template
// through hs_instantiate_template (124), which records the template
// version it came from. Either way the result is a DRAFT the author
// reviews line by line — a template is a starting point, not an answer.
export default function RamsCoshhNewForm({ kind, companyId, userId, sites, templates, substances = [], preselectSubstance = '' }: {
  kind: Kind; companyId: string; userId: string | null;
  sites: { id: string; name: string }[];
  templates: TemplateOption[];
  substances?: { id: string; label: string }[];
  preselectSubstance?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'blank' | 'template'>('blank');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [site, setSite] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [substance, setSubstance] = useState(preselectSubstance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coshh = kind === 'coshh_assessment';
  const tpl = templates.find(t => t.id === templateId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const sb = createClient();
    let id: string | null = null;
    if (mode === 'template') {
      const { data, error: err } = await sb.rpc('hs_instantiate_template', {
        p_template: templateId, p_site: site || null, p_title: title.trim() || null, p_substance: coshh ? substance || null : null,
      });
      if (err) { setBusy(false); setError(err.message); return; }
      id = data as string;
    } else if (coshh) {
      const { data, error: err } = await sb.from('coshh_assessments').insert({
        company_id: companyId, substance_id: substance, title: title.trim(), site_id: site || null, assessor_id: userId,
      }).select('id').single();
      if (err) { setBusy(false); setError(err.message); return; }
      id = data.id as string;
    } else {
      const { data, error: err } = await sb.from('method_statements').insert({
        company_id: companyId, title: title.trim(), project_name: project.trim() || null, site_id: site || null,
        start_date: start || null, end_date: end || null, author_id: userId,
      }).select('id').single();
      if (err) { setBusy(false); setError(err.message); return; }
      id = data.id as string;
    }
    router.push(docPath(kind, id));
  }

  const needSubstance = coshh && !substance;
  return (
    <form onSubmit={submit} className="card p-5 space-y-4 max-w-2xl">
      <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>
        {coshh ? 'New COSHH assessment' : 'New RAMS'}
      </h1>
      <div className="flex gap-2" role="radiogroup" aria-label="How to start">
        <button type="button" role="radio" aria-checked={mode === 'blank'} className={mode === 'blank' ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'}
          style={{ minHeight: 44 }} onClick={() => setMode('blank')}>Start blank</button>
        <button type="button" role="radio" aria-checked={mode === 'template'} className={mode === 'template' ? 'btn-cta btn-sm' : 'btn-secondary btn-sm'}
          style={{ minHeight: 44 }} onClick={() => setMode('template')} disabled={templates.length === 0}>
          From a template{templates.length === 0 ? ' (none available)' : ''}
        </button>
      </div>

      {mode === 'template' && (
        <label className="block"><span className="label">Template</span>
          <select className="input" value={templateId} onChange={e => setTemplateId(e.target.value)} required>
            {templates.map(t => <option key={t.id} value={t.id}>{t.title}{t.visibility === 'platform' ? ' (Core OS 360)' : ''}</option>)}
          </select>
          {tpl?.description && <span className="block text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{tpl.description}</span>}
        </label>
      )}

      {coshh && (
        <label className="block"><span className="label">Substance</span>
          <select className="input" value={substance} onChange={e => setSubstance(e.target.value)} required>
            <option value="">Choose the substance…</option>
            {substances.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {substances.length === 0 && (
            <span className="block text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              Add the substance to the register first (COSHH register → Add substance).
            </span>
          )}
        </label>
      )}

      <label className="block"><span className="label">Title{mode === 'template' ? ' (optional — defaults to the template title)' : ''}</span>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required={mode === 'blank'}
          placeholder={coshh ? 'e.g. Floor cleaning — warehouse' : 'e.g. Replace roof sheeting — Unit 4'} />
      </label>
      {!coshh && mode === 'blank' && (
        <label className="block"><span className="label">Project (optional)</span>
          <input className="input" value={project} onChange={e => setProject(e.target.value)} maxLength={200} />
        </label>
      )}
      <label className="block"><span className="label">Site (optional)</span>
        <select className="input" value={site} onChange={e => setSite(e.target.value)}>
          <option value="">Not set</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {!coshh && mode === 'blank' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Work starts (optional)</span>
            <input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="block"><span className="label">Work ends (optional)</span>
            <input className="input" type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} /></label>
        </div>
      )}
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        This creates a draft. Nothing is approved until someone other than the author reviews and approves it.
      </p>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <button className="btn-cta" style={{ minHeight: 44 }} disabled={busy || needSubstance || (mode === 'blank' && !title.trim()) || (mode === 'template' && !templateId)}>
        {busy && <Loader2 size={16} className="animate-spin" />} Create draft
      </button>
    </form>
  );
}
