'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

const DEFAULT_FLAGS = { hiring: true, documents: true, reports: false, support: true, metrics: false, compliance: false };
const SECTORS = ['Retail & Hospitality','Technology & SaaS','Professional Services','Finance','Manufacturing','Healthcare','Logistics','Other'];
const SIZES   = ['10–24','25–49','50–99','100–249','250+'];

export default function NewClientPage() {
  const router   = useRouter();
  const supabase = createClient();
  const [form,    setForm]    = useState({ name: '', slug: '', sector: '', size_band: '', contact_email: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    const { data, error: err } = await supabase.from('companies').insert({
      name: form.name,
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
      sector: form.sector || null,
      size_band: form.size_band || null,
      contact_email: form.contact_email || null,
      active: true,
      feature_flags: DEFAULT_FLAGS,
    }).select().single();
    if (err) { setError(err.message); setLoading(false); return; }
    router.push(`/clients/${(data as any).id}`);
  }

  return (
    <>
      <AdminTopbar title="New Client" actions={<button onClick={() => router.back()} className="btn-secondary btn-sm">Cancel</button>} />
      <main className="admin-page flex-1 max-w-[580px]">
        <form onSubmit={handleSubmit} className="card p-8 space-y-5">
          <div className="form-group">
            <label className="label">Company name *</label>
            <input required value={form.name} onChange={e=>set('name',e.target.value)} className="input" placeholder="Acme Ltd" />
          </div>
          <div className="form-group">
            <label className="label">Slug (URL-safe ID)</label>
            <input value={form.slug} onChange={e=>set('slug',e.target.value)} className="input" placeholder="acme-ltd (auto-generated if blank)" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="label">Sector</label>
              <select value={form.sector} onChange={e=>set('sector',e.target.value)} className="input">
                <option value="">Select…</option>
                {SECTORS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Team size</label>
              <select value={form.size_band} onChange={e=>set('size_band',e.target.value)} className="input">
                <option value="">Select…</option>
                {SIZES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="label">Primary contact email</label>
            <input type="email" value={form.contact_email} onChange={e=>set('contact_email',e.target.value)} className="input" placeholder="contact@company.co.uk" />
          </div>
          {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#E05555' }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Creating…' : 'Create Client'}
          </button>
          <p className="text-xs text-center" style={{ color: 'var(--ink-faint)' }}>Default feature flags will be applied. You can change them on the client detail page.</p>
        </form>
      </main>
    </>
  );
}
