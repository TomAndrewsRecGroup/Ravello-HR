'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import { createClient } from '@/lib/supabase/client';
import { scoreFriction } from '@/lib/frictionLens';
import { Loader2, Zap } from 'lucide-react';

const WORKING_MODELS = ['Office', 'Hybrid', 'Remote'] as const;
const SENIORITY = ['Junior/Graduate', 'Mid-level', 'Senior', 'Head of/Director', 'C-suite/Executive'] as const;
const EMP_TYPES = ['Permanent', 'Fixed-term', 'Contract', 'Interim'] as const;
const URGENCY_OPTIONS = ['ASAP', 'Within 1 month', 'Within 3 months'] as const;
const REASON_OPTIONS = ['New headcount', 'Replacement', 'Expansion'] as const;

export default function NewRequisitionPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    title: '',
    department: '',
    working_model: '' as 'office' | 'hybrid' | 'remote' | '',
    location: '',
    salary_min: '',
    salary_max: '',
    seniority: '',
    employment_type: '',
    urgency: '',
    reason_for_hire: '',
    interview_stages: '2',
    reporting_line: '',
    must_haves_raw: '',
    nice_to_haves_raw: '',
    description: '',
  });

  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated'); setLoading(false); return; }

    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();

    const must_haves = form.must_haves_raw
      .split('\n').map(s => s.trim()).filter(Boolean);
    const nice_to_haves = form.nice_to_haves_raw
      .split('\n').map(s => s.trim()).filter(Boolean);

    const salary_min = form.salary_min ? Number(form.salary_min) : 0;
    const salary_max = form.salary_max ? Number(form.salary_max) : 0;
    const interview_stages = form.interview_stages ? Number(form.interview_stages) : 2;

    // Score the role via Friction Lens
    setScoring(true);
    let frictionResult;
    try {
      frictionResult = await scoreFriction({
        title: form.title,
        location: form.location || 'Unknown',
        salary_min,
        salary_max,
        skills: must_haves,
        working_model: (form.working_model as 'office' | 'hybrid' | 'remote') || 'office',
        interview_stages,
      });
    } catch {
      frictionResult = null;
    }
    setScoring(false);

    const { data, error: err } = await supabase
      .from('requisitions')
      .insert({
        company_id:               (profile as any).company_id,
        title:                    form.title,
        department:               form.department || null,
        working_model:            (form.working_model as 'office' | 'hybrid' | 'remote') || null,
        location:                 form.location || null,
        salary_min:               salary_min || null,
        salary_max:               salary_max || null,
        seniority:                form.seniority || null,
        employment_type:          form.employment_type || null,
        urgency:                  form.urgency || null,
        reason_for_hire:          form.reason_for_hire || null,
        interview_stages:         interview_stages,
        reporting_line:           form.reporting_line || null,
        must_haves:               must_haves.length ? must_haves : null,
        nice_to_haves:            nice_to_haves.length ? nice_to_haves : null,
        description:              form.description || null,
        friction_score:           frictionResult ? (frictionResult as any) : null,
        friction_level:           frictionResult?.overall_level ?? null,
        friction_recommendations: frictionResult?.recommendations ?? null,
        friction_scored_at:       frictionResult ? new Date().toISOString() : null,
        stage:                    'submitted',
        submitted_by:             user.id,
      })
      .select()
      .single();

    if (err) { setError(err.message); setLoading(false); return; }
    router.push(`/hiring/${(data as any).id}`);
  }

  const isSubmitting = loading;

  return (
    <>
      <Topbar
        title="Raise a Role"
        subtitle="We'll score it against live market data before it goes live"
      />
      <main className="portal-page flex-1 max-w-[720px]">

        {/* Scoring progress banner */}
        {scoring && (
          <div
            className="flex items-center gap-3 rounded-[12px] px-4 py-3 mb-5"
            style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)' }}
          >
            <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: 'var(--purple)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--purple)' }}>
              Running Friction Lens — scoring your role against live market data...
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card p-8 space-y-6">

          {/* Section: Role basics */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--ink-faint)' }}>Role Details</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-group sm:col-span-2">
                <label className="label">Role title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  className="input"
                  placeholder="e.g. Head of Operations"
                />
              </div>
              <div className="form-group">
                <label className="label">Department</label>
                <input
                  value={form.department}
                  onChange={e => set('department', e.target.value)}
                  className="input"
                  placeholder="e.g. Finance"
                />
              </div>
              <div className="form-group">
                <label className="label">Working model</label>
                <select value={form.working_model} onChange={e => set('working_model', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {WORKING_MODELS.map(m => (
                    <option key={m} value={m.toLowerCase()}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="form-group sm:col-span-2">
                <label className="label">Location</label>
                <input
                  value={form.location}
                  onChange={e => set('location', e.target.value)}
                  className="input"
                  placeholder="e.g. London, Manchester, Remote"
                />
              </div>
            </div>
          </div>

          <div className="divider" />

          {/* Section: Salary */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--ink-faint)' }}>Salary Range (£)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="label">Minimum</label>
                <input
                  type="number"
                  min={0}
                  value={form.salary_min}
                  onChange={e => set('salary_min', e.target.value)}
                  className="input"
                  placeholder="e.g. 50000"
                />
              </div>
              <div className="form-group">
                <label className="label">Maximum</label>
                <input
                  type="number"
                  min={0}
                  value={form.salary_max}
                  onChange={e => set('salary_max', e.target.value)}
                  className="input"
                  placeholder="e.g. 65000"
                />
              </div>
            </div>
          </div>

          <div className="divider" />

          {/* Section: Role classification */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--ink-faint)' }}>Classification</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="label">Seniority</label>
                <select value={form.seniority} onChange={e => set('seniority', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {SENIORITY.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Employment type</label>
                <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Urgency</label>
                <select value={form.urgency} onChange={e => set('urgency', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {URGENCY_OPTIONS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Reason for hire</label>
                <select value={form.reason_for_hire} onChange={e => set('reason_for_hire', e.target.value)} className="input">
                  <option value="">Select…</option>
                  {REASON_OPTIONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Interview stages</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={form.interview_stages}
                  onChange={e => set('interview_stages', e.target.value)}
                  className="input"
                />
              </div>
              <div className="form-group">
                <label className="label">Reporting line</label>
                <input
                  value={form.reporting_line}
                  onChange={e => set('reporting_line', e.target.value)}
                  className="input"
                  placeholder="e.g. CEO, CFO"
                />
              </div>
            </div>
          </div>

          <div className="divider" />

          {/* Section: Skills */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--ink-faint)' }}>Skills</p>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Must-have skills <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(one per line)</span></label>
                <textarea
                  value={form.must_haves_raw}
                  onChange={e => set('must_haves_raw', e.target.value)}
                  rows={4}
                  className="input"
                  placeholder={"5+ years in a similar role\nExperience in a PE-backed business\nFull UK driving licence"}
                />
              </div>
              <div className="form-group">
                <label className="label">Nice-to-have skills <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(one per line)</span></label>
                <textarea
                  value={form.nice_to_haves_raw}
                  onChange={e => set('nice_to_haves_raw', e.target.value)}
                  rows={3}
                  className="input"
                  placeholder={"CIPD qualified\nExperience with Workday"}
                />
              </div>
            </div>
          </div>

          <div className="divider" />

          {/* Section: Description */}
          <div className="form-group">
            <label className="label">
              Role description
              <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-faint)' }}>
                {form.description.length}/500
              </span>
            </label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value.slice(0, 500))}
              rows={5}
              className="input"
              placeholder="What does the role involve? Why is it open? Any important context about the team or business?"
              maxLength={500}
            />
          </div>

          {/* Friction Lens notice */}
          <div
            className="flex items-start gap-3 rounded-[10px] p-3"
            style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.12)' }}
          >
            <Zap size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--purple)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              On submit, this role will be scored against live market data using <strong>Friction Lens</strong> — giving you a real-time read on time-to-fill risk and tailored recommendations before going to market.
            </p>
          </div>

          {error && (
            <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting} className="btn-cta flex-1 justify-center">
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {scoring
                ? 'Scoring your role against live market data...'
                : loading
                  ? 'Saving...'
                  : 'Raise this Role'}
            </button>
            <button type="button" onClick={() => router.back()} className="btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
