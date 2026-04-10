'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { scoreFriction } from '@/lib/frictionLens';
import { Loader2, Zap } from 'lucide-react';

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
  recruiters: string[];
}

export default function AdminNewRoleForm({ companies, adminUserId, template, recruiters }: Props) {
  const router  = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    company_id:       '',
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

  function set(k: string, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
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

    setScoring(true);
    let frictionResult;
    try {
      const jd_text = [
        `Role: ${form.title}`,
        form.department  ? `Department: ${form.department}` : '',
        form.seniority   ? `Seniority: ${form.seniority}` : '',
        form.location    ? `Location: ${form.location}` : '',
        form.working_model ? `Working model: ${form.working_model}` : '',
        salary_min || salary_max ? `Salary: £${salary_min?.toLocaleString()}–£${salary_max?.toLocaleString()}` : '',
        must_haves.length ? `Requirements:\n${must_haves.map(s => `- ${s}`).join('\n')}` : '',
        form.description ? `\n${form.description}` : '',
      ].filter(Boolean).join('\n');
      frictionResult = await scoreFriction({ jd_text });
    } catch {
      frictionResult = null;
    }
    setScoring(false);

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
        stage:              form.stage,
        assigned_recruiter: form.assigned_recruiter || null,
        friction_score:     frictionResult        ?? null,
        friction_level:     frictionResult?.overall_level ?? null,
        friction_scored_at: frictionResult ? new Date().toISOString() : null,
        submitted_by:       adminUserId,
      })
      .select()
      .single();

    if (err) { setError(err.message); setLoading(false); return; }
    router.push(`/hiring/${(data as any).id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-[760px]">

      {template && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-sm"
          style={{ background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.2)', color: 'var(--purple)' }}
        >
          <Zap size={13} />
          Pre-filled from template: <strong>{template.title}</strong>
        </div>
      )}

      {scoring && (
        <div className="flex items-center gap-3 rounded-[12px] px-4 py-3"
          style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)' }}>
          <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: 'var(--purple)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--purple)' }}>
            Running Friction Lens — scoring against live market data…
          </span>
        </div>
      )}

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
              <option value="">— unassigned —</option>
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
          <label className="label">Must-haves <span className="ml-1 font-normal" style={{ color: 'var(--ink-faint)' }}>(one per line — used in Friction Lens scoring)</span></label>
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
