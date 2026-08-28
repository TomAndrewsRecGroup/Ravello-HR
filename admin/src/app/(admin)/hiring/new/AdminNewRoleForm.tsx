'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Zap } from 'lucide-react';
import { buildJdText } from '@/lib/jdText';

const WORKING_MODELS   = ['office', 'hybrid', 'remote'] as const;
const SENIORITY_OPTS   = ['Junior/Graduate', 'Mid-level', 'Senior', 'Head of/Director', 'C-suite/Executive'];
const EMP_TYPES        = ['Permanent', 'Fixed-term', 'Contract', 'Interim'];
const STAGE_OPTS       = ['submitted', 'in_progress', 'shortlist_ready', 'interview', 'offer'] as const;
interface Template {
  id: string;
  title: string;
  department: string | null;
  seniority: string | null;
  working_model: string | null;
  description: string | null;
  must_haves: string[] | null;
}

interface Props {
  companies: { id: string; name: string }[];
  adminUserId: string;
  template?: Template | null;
  /** Every JD template, for the picker. The portal has had this since
   *  Phase 36; admin only ever accepted `?template=` in the URL, so a
   *  template was reachable from the Templates page and nowhere else. */
  templates: Template[];
  recruiters: string[];
  presetCompanyId?: string | null;
}

export default function AdminNewRoleForm({ companies, adminUserId, template, templates, recruiters, presetCompanyId }: Props) {
  const router  = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    company_id:       presetCompanyId ?? '',
    title:            template?.title ?? '',
    department:       template?.department ?? '',
    seniority:        template?.seniority ?? '',
    location:         '',
    working_model:    (template?.working_model ?? '') as 'office' | 'hybrid' | 'remote' | '',
    employment_type:  '',
    salary_min:       '',
    salary_max:       '',
    interview_stages: '2',
    must_haves_raw:   (template?.must_haves ?? []).join('\n'),
    description:      template?.description ?? '',
    stage:            'submitted',
    assigned_recruiter: '',
  });

  const [loading,  setLoading]  = useState(false);
  const [scoring,  setScoring]  = useState(false);
  const [error,    setError]    = useState('');

  // Analyse-before-save, as the portal has. Submitting still scores the
  // role if this was never pressed, so nothing is lost by ignoring it —
  // but pressing it means the score is SEEN before the role is created,
  // and an IvyLens failure is reported instead of silently leaving
  // ivylens_role_id null.
  const [preview,      setPreview]      = useState<any>(null);
  const [previewError, setPreviewError] = useState('');
  const [appliedTpl,   setAppliedTpl]   = useState<string>(template?.id ?? '');

  function set(k: string, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
    // The preview describes the text as it was when analysed. Editing
    // any field makes it stale, and a stale score next to changed
    // requirements is worse than no score.
    setPreview(null);
  }

  function applyTemplate(id: string) {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setAppliedTpl(id);
    setPreview(null);
    setForm(prev => ({
      ...prev,
      title:          t.title ?? prev.title,
      department:     t.department ?? prev.department,
      seniority:      t.seniority ?? prev.seniority,
      working_model:  (t.working_model ?? prev.working_model) as typeof prev.working_model,
      must_haves_raw: (t.must_haves ?? []).join('\n') || prev.must_haves_raw,
      description:    t.description ?? prev.description,
    }));
  }

  function currentJdText(): string {
    return buildJdText({
      title:         form.title,
      department:    form.department,
      seniority:     form.seniority,
      location:      form.location,
      working_model: form.working_model,
      salary_min:    form.salary_min ? Number(form.salary_min) : null,
      salary_max:    form.salary_max ? Number(form.salary_max) : null,
      must_haves:    form.must_haves_raw.split('\n').map(x => x.trim()).filter(Boolean),
      description:   form.description,
    });
  }

  async function analyseNow() {
    setScoring(true);
    setPreviewError('');
    try {
      const res  = await fetch('/api/friction/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ jd_text: currentJdText(), title: form.title }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setPreviewError(json.error ?? `Analysis failed (${res.status})`); return; }
      setPreview(json);
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setScoring(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_id || !form.title) {
      setError('Company and role title are required.');
      return;
    }
    setLoading(true);
    setError('');

    const must_haves = form.must_haves_raw.split('\n').map(s => s.trim()).filter(Boolean);
    const salary_min = form.salary_min ? Number(form.salary_min) : 0;
    const salary_max = form.salary_max ? Number(form.salary_max) : 0;
    const interview_stages = form.interview_stages ? Number(form.interview_stages) : 2;

    // A preview is cleared by any field edit, so one that survives to
    // here was computed from exactly this text. Reusing it saves a
    // second metered IvyLens call and — more importantly — guarantees
    // the role is saved with the score the operator actually looked at.
    let frictionResult: any = preview;
    if (!frictionResult) setScoring(true);

    // Composed OUTSIDE the try so it is stored whether or not the
    // analyse call succeeds. It is the referral scan's fallback text —
    // leaving it null drops that fallback to the bare `description`,
    // without the title, seniority, salary or requirements.
    // Same composition the re-analyse route uses, so a role scored here
    // and re-scored later is scored against the same text.
    const jd_text = buildJdText({
      title:         form.title,
      department:    form.department,
      seniority:     form.seniority,
      location:      form.location,
      working_model: form.working_model,
      salary_min,
      salary_max,
      must_haves,
      description:   form.description,
    });

    if (!frictionResult) {
      try {
        const res = await fetch('/api/friction/analyze', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ jd_text, title: form.title }),
        });
        if (res.ok) frictionResult = await res.json();
      } catch {
        frictionResult = null;
      }
      setScoring(false);
    }

    const { data, error: err } = await supabase
      .from('requisitions')
      .insert({
        company_id:         form.company_id,
        title:              form.title,
        department:         form.department       || null,
        seniority:          form.seniority        || null,
        location:           form.location         || null,
        working_model:      form.working_model    || null,
        employment_type:    form.employment_type  || null,
        salary_min:         salary_min            || null,
        salary_max:         salary_max            || null,
        interview_stages,
        must_haves:         must_haves.length ? must_haves : null,
        description:        form.description      || null,
        jd_text,
        stage:              form.stage,
        assigned_recruiter: form.assigned_recruiter || null,
        friction_score:     frictionResult        ?? null,
        friction_level:     frictionResult?.overall_level ?? null,
        friction_scored_at: frictionResult ? new Date().toISOString() : null,
        ivylens_role_id:    frictionResult?.ivylens_role_id ?? null,
        submitted_by:       adminUserId,
      })
      .select()
      .single();

    if (err) { setError(err.message); setLoading(false); return; }
    router.push(`/hiring/${(data as any).id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-[760px]">

      {templates.length > 0 && (
        <div className="card p-4 space-y-2">
          <label className="label" htmlFor="jd-template">Start from a JD template</label>
          <select
            id="jd-template"
            className="input"
            value={appliedTpl}
            onChange={e => { if (e.target.value) applyTemplate(e.target.value); }}
          >
            <option value="">— No template —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.title}{t.department ? ` · ${t.department}` : ''}
              </option>
            ))}
          </select>
          {appliedTpl && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--purple)' }}>
              <Zap size={12} />
              Pre-filled from <strong>{templates.find(t => t.id === appliedTpl)?.title}</strong> — edit anything below.
            </p>
          )}
        </div>
      )}

      {scoring && (
        <div className="flex items-center gap-3 rounded-[12px] px-4 py-3"
          style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)' }}>
          <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: 'var(--purple)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--purple)' }}>
            Running Friction Lens: scoring against live market data…
          </span>
        </div>
      )}

      {/* Analyse before saving, as the portal allows. Optional: saving
          still scores the role. What this adds is SEEING the score, and
          being told when IvyLens could not produce one — which is
          otherwise silent, and leaves ivylens_role_id null. */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Friction Lens</p>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              {preview
                ? 'Scored. Saving will store this result.'
                : 'Optional — check the score before you create the role. It runs on save either way.'}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={analyseNow}
            disabled={scoring || !form.title.trim()}
          >
            {scoring ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {preview ? 'Re-analyse' : 'Analyse now'}
          </button>
        </div>

        {previewError && <p className="text-xs" style={{ color: 'var(--red)' }}>{previewError}</p>}

        {preview && (
          <div className="flex items-center gap-4 flex-wrap pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <div>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Overall</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
                {preview.overall_score ?? '—'}/100
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Friction</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{preview.overall_level ?? 'Unknown'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>IvyLens</p>
              <p className="text-sm font-semibold" style={{ color: preview.ivylens_role_id ? 'var(--teal)' : 'var(--gold)' }}>
                {preview.ivylens_role_id ? 'Linked' : 'Scored locally'}
              </p>
            </div>
            {Array.isArray(preview.recommendations) && preview.recommendations.length > 0 && (
              <ul className="text-xs list-disc pl-4 w-full" style={{ color: 'var(--ink-soft)' }}>
                {preview.recommendations.slice(0, 3).map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-[10px] px-4 py-3 text-sm"
          style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: 'var(--rose)' }}>
          {error}
        </div>
      )}

      {/* Client + initial stage */}
      <div className="card p-6 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>Assignment</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Client *</label>
            <select className="input" required value={form.company_id} onChange={e => set('company_id', e.target.value)}>
              <option value="">Select client…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Initial Stage</label>
            <select className="input" value={form.stage} onChange={e => set('stage', e.target.value)}>
              {STAGE_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assigned Recruiter</label>
            <select className="input" value={form.assigned_recruiter} onChange={e => set('assigned_recruiter', e.target.value)}>
              <option value="">- unassigned -</option>
              {recruiters.map(name => <option key={name}>{name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Role details */}
      <div className="card p-6 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>Role Details</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Role Title *</label>
            <input className="input" required placeholder="e.g. Senior Operations Manager" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label className="label">Department</label>
            <input className="input" placeholder="e.g. Finance" value={form.department} onChange={e => set('department', e.target.value)} />
          </div>
          <div>
            <label className="label">Seniority</label>
            <select className="input" value={form.seniority} onChange={e => set('seniority', e.target.value)}>
              <option value="">Select…</option>
              {SENIORITY_OPTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" placeholder="e.g. London, Hybrid" value={form.location} onChange={e => set('location', e.target.value)} />
          </div>
          <div>
            <label className="label">Working Model</label>
            <select className="input" value={form.working_model} onChange={e => set('working_model', e.target.value)}>
              <option value="">Select…</option>
              {WORKING_MODELS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Employment Type</label>
            <select className="input" value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
              <option value="">Select…</option>
              {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Interview Stages</label>
            <select className="input" value={form.interview_stages} onChange={e => set('interview_stages', e.target.value)}>
              {['1','2','3','4','5'].map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Salary Min (£)</label>
            <input type="number" className="input" placeholder="40000" value={form.salary_min} onChange={e => set('salary_min', e.target.value)} />
          </div>
          <div>
            <label className="label">Salary Max (£)</label>
            <input type="number" className="input" placeholder="55000" value={form.salary_max} onChange={e => set('salary_max', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Description + must-haves */}
      <div className="card p-6 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-faint)' }}>Brief & Requirements</p>
        <div>
          <label className="label">Role Description</label>
          <textarea className="input h-28 resize-none" placeholder="Overview of the role and responsibilities…" value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className="label">Must-haves <span className="ml-1 font-normal" style={{ color: 'var(--ink-faint)' }}>(one per line: used in Friction Lens scoring)</span></label>
          <textarea className="input h-24 resize-none font-mono text-sm" placeholder={"5+ years in operations\nStrong Excel / data analysis\nTeam leadership experience"} value={form.must_haves_raw} onChange={e => set('must_haves_raw', e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="btn-cta flex items-center gap-2">
          {loading
            ? <Loader2 size={14} className="animate-spin" />
            : <Zap size={14} />}
          {scoring ? 'Scoring…' : loading ? 'Creating…' : 'Create Role + Score'}
        </button>
        <a href="/hiring" className="btn-ghost">Cancel</a>
      </div>
    </form>
  );
}
