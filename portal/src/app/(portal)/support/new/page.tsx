'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

const PRIORITIES = ['low','normal','high','urgent'];

export default function NewTicketPage() {
  const router   = useRouter();
  const supabase = createClient();
  const [form,    setForm]    = useState({ subject: '', description: '', priority: 'normal' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated'); setLoading(false); return; }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
    const { data, error: err } = await supabase
      .from('tickets')
      .insert({
        company_id:   (profile as any).company_id,
        submitted_by: user.id,
        subject:      form.subject,
        description:  form.description,
        priority:     form.priority,
        status:       'open',
      })
      .select().single();
    if (err) { setError(err.message); setLoading(false); return; }
    router.push(`/support/${(data as any).id}`);
  }

  return (
    <>
      <Topbar title="Raise a Query" subtitle="Ravello will respond within one business day" />
      <main className="portal-page flex-1 max-w-[640px]">
        <form onSubmit={handleSubmit} className="card p-8 space-y-5">
          <div className="form-group">
            <label className="label">Subject *</label>
            <input required value={form.subject} onChange={e=>set('subject',e.target.value)} className="input" placeholder="Brief summary of your query" />
          </div>
          <div className="form-group">
            <label className="label">Full details *</label>
            <textarea required value={form.description} onChange={e=>set('description',e.target.value)} rows={5} className="input" placeholder="Describe the situation in as much detail as you can. Include any relevant dates, names, or documentation." />
          </div>
          <div className="form-group">
            <label className="label">Priority</label>
            <select value={form.priority} onChange={e=>set('priority',e.target.value)} className="input">
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Urgent = same-day response required. High = within 4 hours. Normal/Low = next business day.</p>
          </div>
          {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-cta flex-1 justify-center">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Submitting…' : 'Submit Query'}
            </button>
            <button type="button" onClick={() => router.back()} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </main>
    </>
  );
}
