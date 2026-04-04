'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2, Star, Clock, CheckCircle2, XCircle, ClipboardList } from 'lucide-react';

interface Review {
  id: string;
  employee_name: string;
  employee_email: string | null;
  department: string | null;
  review_period: string;
  review_type: string;
  status: string;
  overall_rating: string | null;
  reviewer_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Props { companyId: string; initialReviews: Review[]; }

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending:     { label: 'Pending',     bg: 'rgba(148,163,184,0.12)', color: '#475569' },
  in_progress: { label: 'In Progress', bg: 'rgba(59,111,255,0.12)',  color: '#1848CC' },
  completed:   { label: 'Completed',   bg: 'rgba(22,163,74,0.12)',   color: '#166534' },
  cancelled:   { label: 'Cancelled',   bg: 'rgba(220,38,38,0.10)',   color: '#991B1B' },
};

const REVIEW_TYPES = ['annual', 'mid_year', 'probation', '360', 'other'];
const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
const RATINGS = ['Exceeds Expectations', 'Meets Expectations', 'Below Expectations', 'Outstanding', 'Unsatisfactory'];

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ReviewsClient({ companyId, initialReviews }: Props) {
  const supabase = createClient();
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    employee_name: '', employee_email: '', department: '',
    review_period: '', review_type: 'annual', reviewer_name: '',
    due_date: '', overall_rating: '', notes: '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.employee_name.trim() || !form.review_period.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('performance_reviews').insert({
      company_id:     companyId,
      employee_name:  form.employee_name,
      employee_email: form.employee_email || null,
      department:     form.department || null,
      review_period:  form.review_period,
      review_type:    form.review_type,
      reviewer_name:  form.reviewer_name || null,
      due_date:       form.due_date || null,
      overall_rating: form.overall_rating || null,
      notes:          form.notes || null,
      status:         'pending',
    }).select().single();
    if (data) setReviews(prev => [data as Review, ...prev]);
    setSaving(false);
    setShowForm(false);
    setForm({ employee_name: '', employee_email: '', department: '', review_period: '', review_type: 'annual', reviewer_name: '', due_date: '', overall_rating: '', notes: '' });
  }

  async function updateStatus(id: string, status: string) {
    const extra: Record<string, string> = {};
    if (status === 'completed') extra.completed_at = new Date().toISOString();
    await supabase.from('performance_reviews').update({ status, ...extra }).eq('id', id);
    setReviews(prev => prev.map(r => r.id === id ? { ...r, status, ...extra } : r));
  }

  const filtered = filter === 'all' ? reviews : reviews.filter(r => r.status === filter);

  const counts = {
    pending:     reviews.filter(r => r.status === 'pending').length,
    in_progress: reviews.filter(r => r.status === 'in_progress').length,
    completed:   reviews.filter(r => r.status === 'completed').length,
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Pending',     value: counts.pending,     color: '#475569' },
          { label: 'In Progress', value: counts.in_progress, color: '#D97706' },
          { label: 'Completed',   value: counts.completed,   color: '#16A34A' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {['all', ...STATUSES].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`btn-sm ${filter === s ? 'btn-cta' : 'btn-secondary'}`}>
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Review
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>New Performance Review</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Employee Name *</label>
              <input className="input" placeholder="e.g. James Smith" value={form.employee_name} onChange={e => set('employee_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Employee Email</label>
              <input type="email" className="input" placeholder="james@company.com" value={form.employee_email} onChange={e => set('employee_email', e.target.value)} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" placeholder="e.g. Engineering" value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div>
              <label className="label">Review Period *</label>
              <input className="input" placeholder="e.g. Annual 2025, Q1 2026" value={form.review_period} onChange={e => set('review_period', e.target.value)} />
            </div>
            <div>
              <label className="label">Review Type</label>
              <select className="input" value={form.review_type} onChange={e => set('review_type', e.target.value)}>
                {REVIEW_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Reviewer</label>
              <input className="input" placeholder="e.g. Line Manager" value={form.reviewer_name} onChange={e => set('reviewer_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Overall Rating</label>
              <select className="input" value={form.overall_rating} onChange={e => set('overall_rating', e.target.value)}>
                <option value="">Not yet rated</option>
                {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input h-16 resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.employee_name.trim() || !form.review_period.trim()} className="btn-cta btn-sm flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state py-4">
            <ClipboardList size={24} />
            <p className="text-sm">No reviews {filter !== 'all' ? `with status "${filter}"` : 'yet'}</p>
            <p className="text-xs max-w-[280px]">Add performance reviews to track your team's development cycles.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {['Employee', 'Period', 'Type', 'Reviewer', 'Due', 'Rating', 'Status', ''].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                return (
                  <tr key={r.id}>
                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{r.employee_name}</p>
                      {r.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.department}</p>}
                    </td>
                    <td className="text-sm">{r.review_period}</td>
                    <td className="text-sm capitalize">{r.review_type.replace(/_/g, ' ')}</td>
                    <td className="text-sm">{r.reviewer_name ?? '—'}</td>
                    <td className="text-sm">{fmtDate(r.due_date)}</td>
                    <td className="text-sm">{r.overall_rating ?? '—'}</td>
                    <td>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </td>
                    <td>
                      {r.status !== 'completed' && r.status !== 'cancelled' && (
                        <select
                          className="input text-xs py-1 w-auto"
                          value={r.status}
                          onChange={e => updateStatus(r.id, e.target.value)}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
