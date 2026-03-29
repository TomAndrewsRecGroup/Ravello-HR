'use client';
export const dynamic = 'force-dynamic';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import FrictionScoreCard from '@/components/FrictionScoreCard';
import { createClient } from '@/lib/supabase/client';
import type { FrictionScore } from '@/lib/supabase/types';
import { Loader2, Zap, Upload, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';

interface JDTemplate {
  id: string;
  title: string;
  department: string | null;
  seniority: string | null;
  working_model: string | null;
  description: string | null;
  must_haves: string[] | null;
}

const WORKING_MODELS = ['Office', 'Hybrid', 'Remote'] as const;
const SENIORITY      = ['Junior/Graduate', 'Mid-level', 'Senior', 'Head of/Director', 'C-suite/Executive'] as const;
const EMP_TYPES      = ['Permanent', 'Fixed-term', 'Contract', 'Interim'] as const;
const URGENCY        = ['ASAP', 'Within 1 month', 'Within 3 months'] as const;
const REASONS        = ['New headcount', 'Replacement', 'Expansion'] as const;

export default function NewRequisitionPage() {
  const router   = useRouter();
  const supabase = createClient();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [jdText,        setJdText]        = useState('');
  const [jdOpen,        setJdOpen]        = useState(true);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [frictionScore, setFrictionScore] = useState<FrictionScore | null>(null);
  const [analyzeError,  setAnalyzeError]  = useState('');
  const [autoFilled,    setAutoFilled]    = useState(false);

  const [form, setForm] = useState({
    title: '', department: '', working_model: '' as 'office' | 'hybrid' | 'remote' | '',
    location: '', salary_min: '', salary_max: '', seniority: '',
    employment_type: '', urgency: '', reason_for_hire: '',
    interview_stages: '2', reporting_line: '',
    must_haves_raw: '', nice_to_haves_raw: '', description: '',
  });
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [templates, setTemplates] = useState<JDTemplate[]>([]);

  function set(k: string, v: string) { setForm(prev => ({ ...prev, [k]: v })); }

  // Fetch JD templates on mount
  useEffect(() => {
    const supabaseClient = createClient();
    supabaseClient.from('jd_templates').select('id,title,department,seniority,working_model,description,must_haves').order('title').then(({ data }) => {
      if (data) setTemplates(data as JDTemplate[]);
    });
  }, []);

  function applyTemplate(id: string) {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setForm(prev => ({
      ...prev,
      title:          t.title,
      department:     t.department ?? prev.department,
      seniority:      t.seniority  ?? prev.seniority,
      working_model:  (t.working_model?.toLowerCase() as typeof prev.working_model) ?? prev.working_model,
      description:    t.description ?? prev.description,
      must_haves_raw: (t.must_haves ?? []).join('\n'),
    }));
  }

  async function analyzeJD() {
    if (jdText.trim().length < 20) { setAnalyzeError('Please paste at least a few lines of the job description.'); return; }
    setAnalyzing(true); setAnalyzeError(''); setFrictionScore(null);
    try {
      const res = await fetch('/api/friction/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_text: jdText }),
      });
      if (!res.ok) throw new Error('failed');
      setFrictionScore(await res.json());
    } catch {
      setAnalyzeError('Could not analyse the job description. You can still fill in the form manually.');
    } finally { setAnalyzing(false); }
  }

  function autoFillFromJD() {
    const r = frictionScore?.extracted_role;
    if (!r) return;
    setForm(prev => ({
      ...prev,
      title:           r.title            ?? prev.title,
      location:        r.location         ?? prev.location,
      department:      r.department       ?? prev.department,
      salary_min:      r.salary_min != null ? String(r.salary_min) : prev.salary_min,
      salary_max:      r.salary_max != null ? String(r.salary_max) : prev.salary_max,
      working_model:   (r.working_model?.toLowerCase() as typeof prev.working_model) ?? prev.working_model,
      seniority:       r.seniority        ?? prev.seniority,
      employment_type: r.employment_type  ?? prev.employment_type,
      must_haves_raw:  r.required_skills?.join('\n') ?? prev.must_haves_raw,
    }));
    setAutoFilled(true); setJdOpen(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.txt')) { setAnalyzeError('Only .txt files are supported. Please paste the text directly for other formats.'); return; }
    setJdText(await file.text()); setFrictionScore(null); setAutoFilled(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated'); setLoading(false); return; }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
    const must_haves    = form.must_haves_raw.split('\n').map(s => s.trim()).filter(Boolean);
    const nice_to_haves = form.nice_to_haves_raw.split('\n').map(s => s.trim()).filter(Boolean);
    const salary_min    = form.salary_min ? Number(form.salary_min) : 0;
    const salary_max    = form.salary_max ? Number(form.salary_max) : 0;
    const interview_stages = Number(form.interview_stages) || 2;
    let finalScore = frictionScore;
    if (!finalScore && jdText.trim().length >= 20) {
      try {
        const res = await fetch('/api/friction/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jd_text: jdText }) });
        if (res.ok) finalScore = await res.json();
      } catch { /* proceed without score */ }
    }
    const { data, error: err } = await supabase.from('requisitions').insert({
      company_id: (profile as any).company_id, title: form.title,
      department: form.department || null, working_model: form.working_model || null,
      location: form.location || null, salary_min: salary_min || null, salary_max: salary_max || null,
      seniority: form.seniority || null, employment_type: form.employment_type || null,
      urgency: form.urgency || null, reason_for_hire: form.reason_for_hire || null,
      interview_stages, reporting_line: form.reporting_line || null,
      must_haves: must_haves.length ? must_haves : null,
      nice_to_haves: nice_to_haves.length ? nice_to_haves : null,
      description: form.description || null, jd_text: jdText || null,
      friction_score: finalScore ?? null, friction_level: finalScore?.overall_level ?? null,
      friction_recommendations: finalScore?.recommendations ?? null,
      friction_scored_at: finalScore ? new Date().toISOString() : null,
      stage: 'pending_approval', submitted_by: user.id,
    }).select().single();
    if (err) { setError(err.message); setLoading(false); return; }

    // Notify admin users about the new role awaiting approval
    const companyId = (profile as any).company_id;
    const { data: company } = await supabase.from('companies').select('name').eq('id', companyId).single();
    const { data: admins } = await supabase.from('profiles').select('id').in('role', ['tps_admin', 'tps_recruiter']);
    if (admins?.length) {
      const notifications = admins.map((admin: any) => ({
        user_id: admin.id,
        company_id: companyId,
        type: 'role_pending_approval',
        title: `New role awaiting approval: ${form.title}`,
        body: `${company?.name ?? 'A client'} has submitted "${form.title}" for approval.`,
        link: `/hiring/${(data as any).id}`,
      }));
      await supabase.from('notifications').insert(notifications);
    }

    router.push(`/hiring/${(data as any).id}`);
  }

  return (
    <>
      <Topbar title="Raise a Role" subtitle="Paste your job description and we'll score it before it goes live" />
      <main className="portal-page flex-1 max-w-[720px]">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Template selector */}
          {templates.length > 0 && (
            <div className="card p-4 flex items-center gap-3">
              <Wand2 size={15} style={{ color: 'var(--purple)', flexShrink: 0 }} />
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Start from template</p>
              <select
                className="input h-8 text-sm flex-1 max-w-[260px]"
                defaultValue=""
                onChange={e => applyTemplate(e.target.value)}
              >
                <option value="" disabled>Choose a template…</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.title}{t.department ? ` (${t.department})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Step 1 — JD Import */}
          <div className="card overflow-hidden">
            <button type="button" onClick={() => setJdOpen(o => !o)}
              className="w-full flex items-center justify-between px-6 py-4"
              style={{ borderBottom: jdOpen ? '1px solid var(--line)' : 'none' }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: frictionScore ? '#16A34A' : 'var(--purple)', color: '#fff' }}>
                  {frictionScore ? '✓' : '1'}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    Import Job Description
                    <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>optional — recommended for Friction Lens scoring</span>
                  </p>
                  {autoFilled && !jdOpen && <p className="text-xs mt-0.5" style={{ color: '#16A34A' }}>Form auto-filled from JD</p>}
                </div>
              </div>
              {jdOpen ? <ChevronUp size={16} style={{ color: 'var(--ink-faint)' }} /> : <ChevronDown size={16} style={{ color: 'var(--ink-faint)' }} />}
            </button>

            {jdOpen && (
              <div className="p-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label">Paste job description text</label>
                    <label className="btn-ghost btn-sm flex items-center gap-1.5 cursor-pointer">
                      <Upload size={12} /> Upload .txt
                      <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>
                  <textarea className="input h-36 resize-none text-sm"
                    placeholder="Paste the full job description here — IvyLens will extract role details and score against live market data…"
                    value={jdText}
                    onChange={e => { setJdText(e.target.value); setFrictionScore(null); setAutoFilled(false); }} />
                </div>

                {analyzeError && (
                  <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{analyzeError}</p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <button type="button" onClick={analyzeJD} disabled={analyzing || !jdText.trim()} className="btn-cta btn-sm flex items-center gap-1.5">
                    {analyzing ? <><Loader2 size={12} className="animate-spin" /> Analysing…</> : <><Zap size={12} /> Run Friction Lens</>}
                  </button>
                  {frictionScore?.extracted_role && !autoFilled && (
                    <button type="button" onClick={autoFillFromJD} className="btn-secondary btn-sm flex items-center gap-1.5">
                      <Wand2 size={12} /> Auto-fill form fields
                    </button>
                  )}
                  {autoFilled && <span className="text-xs font-medium" style={{ color: '#16A34A' }}>✓ Form fields auto-filled — review and edit below</span>}
                </div>

                {frictionScore && <div className="mt-2"><FrictionScoreCard score={frictionScore} /></div>}
              </div>
            )}
          </div>

          {/* Step 2 — Role Details */}
          <div className="card p-6 space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--purple)', color: '#fff' }}>2</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Role Details</p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--ink-faint)' }}>Basic Info</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Role title *</label>
                  <input required value={form.title} onChange={e => set('title', e.target.value)} className="input" placeholder="e.g. Head of Operations" />
                </div>
                <div>
                  <label className="label">Department</label>
                  <input value={form.department} onChange={e => set('department', e.target.value)} className="input" placeholder="e.g. Finance" />
                </div>
                <div>
                  <label className="label">Working model</label>
                  <select value={form.working_model} onChange={e => set('working_model', e.target.value)} className="input">
                    <option value="">Select…</option>
                    {WORKING_MODELS.map(m => <option key={m} value={m.toLowerCase()}>{m}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Location</label>
                  <input value={form.location} onChange={e => set('location', e.target.value)} className="input" placeholder="e.g. London, Manchester, Remote" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--ink-faint)' }}>Salary Range (£)</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Minimum</label><input type="number" min={0} value={form.salary_min} onChange={e => set('salary_min', e.target.value)} className="input" placeholder="50000" /></div>
                <div><label className="label">Maximum</label><input type="number" min={0} value={form.salary_max} onChange={e => set('salary_max', e.target.value)} className="input" placeholder="65000" /></div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--ink-faint)' }}>Classification</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="label">Seniority</label><select value={form.seniority} onChange={e => set('seniority', e.target.value)} className="input"><option value="">Select…</option>{SENIORITY.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label className="label">Employment type</label><select value={form.employment_type} onChange={e => set('employment_type', e.target.value)} className="input"><option value="">Select…</option>{EMP_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label className="label">Urgency</label><select value={form.urgency} onChange={e => set('urgency', e.target.value)} className="input"><option value="">Select…</option>{URGENCY.map(u => <option key={u}>{u}</option>)}</select></div>
                <div><label className="label">Reason for hire</label><select value={form.reason_for_hire} onChange={e => set('reason_for_hire', e.target.value)} className="input"><option value="">Select…</option>{REASONS.map(r => <option key={r}>{r}</option>)}</select></div>
                <div><label className="label">Interview stages</label><input type="number" min={1} max={6} value={form.interview_stages} onChange={e => set('interview_stages', e.target.value)} className="input" /></div>
                <div><label className="label">Reporting line</label><input value={form.reporting_line} onChange={e => set('reporting_line', e.target.value)} className="input" placeholder="e.g. CEO, CFO" /></div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--ink-faint)' }}>Skills</p>
              <div className="space-y-4">
                <div>
                  <label className="label">Must-have skills <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(one per line)</span></label>
                  <textarea value={form.must_haves_raw} onChange={e => set('must_haves_raw', e.target.value)} rows={4} className="input" placeholder={"5+ years in a similar role\nExperience in a PE-backed business\nFull UK driving licence"} />
                </div>
                <div>
                  <label className="label">Nice-to-have skills <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(one per line)</span></label>
                  <textarea value={form.nice_to_haves_raw} onChange={e => set('nice_to_haves_raw', e.target.value)} rows={3} className="input" placeholder={"CIPD qualified\nExperience with Workday"} />
                </div>
              </div>
            </div>

            <div>
              <label className="label">Role description <span className="ml-1 text-[11px] font-normal" style={{ color: 'var(--ink-faint)' }}>{form.description.length}/500</span></label>
              <textarea value={form.description} onChange={e => set('description', e.target.value.slice(0, 500))} rows={5} className="input"
                placeholder="What does the role involve? Why is it open? Any important context about the team or business?" maxLength={500} />
            </div>

            {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={loading} className="btn-cta flex-1 justify-center flex items-center gap-2">
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? 'Submitting…' : 'Submit for Approval'}
              </button>
              <button type="button" onClick={() => router.back()} className="btn-secondary" disabled={loading}>Cancel</button>
            </div>
          </div>

        </form>
      </main>
    </>
  );
}
