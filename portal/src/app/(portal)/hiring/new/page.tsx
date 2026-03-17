'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

const SENIORITY = ['Junior / Graduate', 'Mid-level', 'Senior', 'Head of / Director', 'C-suite / Executive'];
const EMP_TYPES  = ['Permanent', 'Fixed-term', 'Contract', 'Interim'];

export default function NewRequisitionPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    title: '', department: '', seniority: '', salary_range: '',
    location: '', employment_type: '', description: '',
    must_haves_raw: '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

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

    const { data, error: err } = await supabase
      .from('requisitions')
      .insert({
        company_id:      (profile as any).company_id,
        title:           form.title,
        department:      form.department || null,
        seniority:       form.seniority || null,
        salary_range:    form.salary_range || null,
        location:        form.location || null,
        employment_type: form.employment_type || null,
        description:     form.description || null,
        must_haves:      must_haves.length ? must_haves : null,
        stage:           'submitted',
        submitted_by:    user.id,
      })
      .select()
      .single();

    if (err) { setError(err.message); setLoading(false); return; }
    router.push(`/hiring/${(data as any).id}`);
  }

  return (
    <>
      <Topbar title="Submit a Role" subtitle="Ravello will coordinate sourcing via our specialist recruiter network" />
      <main className="portal-page flex-1 max-w-[680px]">
        <form onSubmit={handleSubmit} className="card p-8 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="form-group sm:col-span-2">
              <label className="label">Job title *</label>
              <input required value={form.title} onChange={e=>set('title',e.target.value)} className="input" placeholder="e.g. Head of Operations" />
            </div>
            <div className="form-group">
              <label className="label">Department</label>
              <input value={form.department} onChange={e=>set('department',e.target.value)} className="input" placeholder="e.g. Finance" />
            </div>
            <div className="form-group">
              <label className="label">Seniority</label>
              <select value={form.seniority} onChange={e=>set('seniority',e.target.value)} className="input">
                <option value="">Select…</option>
                {SENIORITY.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Salary / day rate range</label>
              <input value={form.salary_range} onChange={e=>set('salary_range',e.target.value)} className="input" placeholder="e.g. £55,000–£65,000" />
            </div>
            <div className="form-group">
              <label className="label">Location</label>
              <input value={form.location} onChange={e=>set('location',e.target.value)} className="input" placeholder="e.g. London / Remote / Hybrid" />
            </div>
            <div className="form-group">
              <label className="label">Employment type</label>
              <select value={form.employment_type} onChange={e=>set('employment_type',e.target.value)} className="input">
                <option value="">Select…</option>
                {EMP_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Role overview / context</label>
            <textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={4} className="input" placeholder="What does the role involve? Why is it open? Any important context about the team or business?" />
          </div>

          <div className="form-group">
            <label className="label">Must-haves (one per line)</label>
            <textarea value={form.must_haves_raw} onChange={e=>set('must_haves_raw',e.target.value)} rows={4} className="input" placeholder={"5+ years in a similar role\nExperience in a PE-backed business\nFull UK driving licence"} />
          </div>

          {error && <p className="text-xs p-3 rounded-[8px]" style={{background:'rgba(239,68,68,0.08)',color:'#E05555'}}>{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-cta flex-1 justify-center">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Submitting…' : 'Submit Requirement'}
            </button>
            <button type="button" onClick={()=>router.back()} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </main>
    </>
  );
}
