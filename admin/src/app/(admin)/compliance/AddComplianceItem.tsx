'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X, ShieldCheck } from 'lucide-react';

interface Company { id: string; name: string; }

const CATEGORIES = ['hmrc', 'data_protection', 'health_safety', 'employment_law', 'right_to_work', 'training', 'other'];
const STATUSES   = ['pending', 'in_progress', 'complete'];

export default function AddComplianceItem({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [form,    setForm]    = useState({
    company_id:  '',
    title:       '',
    description: '',
    category:    'other',
    due_date:    '',
    status:      'pending',
  });

  function reset() {
    setForm({ company_id: '', title: '', description: '', category: 'other', due_date: '', status: 'pending' });
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_id) { setError('Pick a client.'); return; }
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/compliance', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to create item');
      reset();
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create item');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-cta btn-sm flex items-center gap-1.5"
      >
        <Plus size={13} /> Add compliance item
      </button>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} style={{ color: 'var(--purple)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>New compliance item</h3>
        </div>
        <button onClick={() => { setOpen(false); reset(); }} className="btn-icon btn-ghost" aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <div className="form-group sm:col-span-2">
          <label className="label">Client *</label>
          <select className="input" value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}>
            <option value="">Select…</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual GDPR review" />
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What needs doing, links to evidence, etc." />
        </div>
        <div className="form-group">
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Due date</label>
          <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {error && (
          <p className="sm:col-span-2 text-xs p-2.5 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>{error}</p>
        )}
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => { setOpen(false); reset(); }} className="btn-secondary btn-sm" disabled={loading}>Cancel</button>
          <button type="submit" className="btn-cta btn-sm" disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : null}
            {loading ? 'Saving…' : 'Save item'}
          </button>
        </div>
      </form>
    </div>
  );
}
