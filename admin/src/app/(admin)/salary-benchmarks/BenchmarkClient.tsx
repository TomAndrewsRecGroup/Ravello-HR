'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2, Trash2, PoundSterling } from 'lucide-react';

interface Benchmark {
  id: string;
  role_type: string;
  location: string | null;
  seniority: string | null;
  working_model: string | null;
  salary_p25: number | null;
  salary_p50: number | null;
  salary_p75: number | null;
  salary_p90: number | null;
  source: string | null;
  effective_date: string | null;
  notes: string | null;
}

interface Props { userId: string; initialBenchmarks: Benchmark[]; }

const SENIORITIES  = ['Junior', 'Mid', 'Senior', 'Lead', 'Director', 'C-Level'];
const MODELS       = ['', 'office', 'hybrid', 'remote'];
const MODEL_LABELS = { '': 'All', office: 'Office', hybrid: 'Hybrid', remote: 'Remote' };

function fmtK(p: number | null): string {
  if (!p) return '—';
  return `£${Math.round(p / 1000)}k`;
}

export default function BenchmarkClient({ userId, initialBenchmarks }: Props) {
  const supabase = createClient();
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>(initialBenchmarks);
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [form, setForm] = useState({
    role_type:      '',
    location:       '',
    seniority:      '',
    working_model:  '',
    salary_p25:     '',
    salary_p50:     '',
    salary_p75:     '',
    salary_p90:     '',
    source:         '',
    effective_date: '',
    notes:          '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }
  function toInt(s: string): number | null { const n = parseInt(s, 10); return isNaN(n) ? null : n; }

  async function save() {
    if (!form.role_type.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('salary_benchmarks').insert({
      role_type:      form.role_type,
      location:       form.location   || null,
      seniority:      form.seniority  || null,
      working_model:  form.working_model || null,
      salary_p25:     toInt(form.salary_p25),
      salary_p50:     toInt(form.salary_p50),
      salary_p75:     toInt(form.salary_p75),
      salary_p90:     toInt(form.salary_p90),
      source:         form.source         || null,
      effective_date: form.effective_date || null,
      notes:          form.notes          || null,
      created_by:     userId,
    }).select().single();
    if (data) setBenchmarks(prev => [data as Benchmark, ...prev]);
    setSaving(false);
    setShowForm(false);
    setForm({ role_type: '', location: '', seniority: '', working_model: '', salary_p25: '', salary_p50: '', salary_p75: '', salary_p90: '', source: '', effective_date: '', notes: '' });
  }

  async function remove(id: string) {
    await supabase.from('salary_benchmarks').delete().eq('id', id);
    setBenchmarks(prev => prev.filter(b => b.id !== id));
  }

  const filtered = search
    ? benchmarks.filter(b => b.role_type.toLowerCase().includes(search.toLowerCase()) || b.location?.toLowerCase().includes(search.toLowerCase()))
    : benchmarks;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          className="input flex-1"
          placeholder="Search role type or location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Benchmark
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>New Salary Benchmark</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Role Type *</label>
              <input className="input" placeholder="e.g. HR Manager, Software Engineer" value={form.role_type} onChange={e => set('role_type', e.target.value)} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" placeholder="e.g. London, Manchester, Remote" value={form.location} onChange={e => set('location', e.target.value)} />
            </div>
            <div>
              <label className="label">Seniority</label>
              <select className="input" value={form.seniority} onChange={e => set('seniority', e.target.value)}>
                <option value="">Any</option>
                {SENIORITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Working Model</label>
              <select className="input" value={form.working_model} onChange={e => set('working_model', e.target.value)}>
                {MODELS.map(m => <option key={m} value={m}>{MODEL_LABELS[m as keyof typeof MODEL_LABELS]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">P25 Salary (£)</label>
              <input type="number" className="input" placeholder="35000" value={form.salary_p25} onChange={e => set('salary_p25', e.target.value)} />
            </div>
            <div>
              <label className="label">P50 / Median (£)</label>
              <input type="number" className="input" placeholder="45000" value={form.salary_p50} onChange={e => set('salary_p50', e.target.value)} />
            </div>
            <div>
              <label className="label">P75 Salary (£)</label>
              <input type="number" className="input" placeholder="55000" value={form.salary_p75} onChange={e => set('salary_p75', e.target.value)} />
            </div>
            <div>
              <label className="label">P90 Salary (£)</label>
              <input type="number" className="input" placeholder="70000" value={form.salary_p90} onChange={e => set('salary_p90', e.target.value)} />
            </div>
            <div>
              <label className="label">Source</label>
              <input className="input" placeholder="e.g. Reed 2025 Salary Guide" value={form.source} onChange={e => set('source', e.target.value)} />
            </div>
            <div>
              <label className="label">Effective Date</label>
              <input type="date" className="input" value={form.effective_date} onChange={e => set('effective_date', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <input className="input" placeholder="Any context about this data" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.role_type.trim()} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card empty-state">
          <PoundSterling size={24} />
          <p className="text-sm">No salary benchmarks yet</p>
          <p className="text-xs max-w-[280px]">Add market salary data so clients can compare their roles against benchmarks.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Role Type</th>
                <th>Location</th>
                <th>Seniority</th>
                <th>P25</th>
                <th>Median</th>
                <th>P75</th>
                <th>P90</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id}>
                  <td className="font-medium" style={{ color: 'var(--ink)' }}>{b.role_type}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{b.location ?? 'Any'}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{b.seniority ?? '—'}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{fmtK(b.salary_p25)}</td>
                  <td className="font-semibold" style={{ color: 'var(--ink)' }}>{fmtK(b.salary_p50)}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{fmtK(b.salary_p75)}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{fmtK(b.salary_p90)}</td>
                  <td className="text-xs" style={{ color: 'var(--ink-faint)', maxWidth: 140 }}>
                    {b.source ?? '—'}
                    {b.effective_date && <span className="block">{new Date(b.effective_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>}
                  </td>
                  <td>
                    <button onClick={() => remove(b.id)} className="btn-icon btn-ghost btn-sm" style={{ color: '#DC2626' }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
