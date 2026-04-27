'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminTopbar from '@/components/layout/AdminTopbar';
import { Loader2, Mail, CheckCircle2, PoundSterling, AlertTriangle } from 'lucide-react';

const SECTORS = ['Retail & Hospitality','Technology & SaaS','Professional Services','Finance','Manufacturing','Healthcare','Logistics','Other'];
const SIZES   = ['10-24','25-49','50-99','100-249','250+'];

export default function NewClientPage() {
  const router   = useRouter();
  const [form,             setForm]             = useState({ name: '', slug: '', sector: '', size_band: '', contact_email: '' });
  const [retainerPounds,   setRetainerPounds]   = useState('');
  const [sendInvite,       setSendInvite]       = useState(true);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState('');
  const [inviteNote,       setInviteNote]       = useState('');
  const [stripeNote,       setStripeNote]       = useState('');

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInviteNote('');
    setStripeNote('');

    // Convert retainer pounds → pence; allow blank/zero (admin can
    // skip Stripe setup at create time and add billing later).
    const retainerPounds_n = parseFloat(retainerPounds);
    const retainerPence    = !isNaN(retainerPounds_n) && retainerPounds_n > 0
      ? Math.round(retainerPounds_n * 100)
      : null;

    // 1. Create the company (server-side: handles Stripe customer +
    // subscription creation atomically when retainer > 0).
    let companyId: string;
    try {
      const res = await fetch('/api/admin/clients', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:                    form.name,
          slug:                    form.slug,
          sector:                  form.sector       || null,
          size_band:               form.size_band    || null,
          contact_email:           form.contact_email || null,
          monthly_retainer_pence:  retainerPence,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not create client.');
        setLoading(false);
        return;
      }
      companyId = data.company_id;
      if (data.stripe?.error) {
        setStripeNote(`Client created, but Stripe billing setup failed: ${data.stripe.error}. You can retry from the client detail page.`);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Network error.');
      setLoading(false);
      return;
    }

    // 2. Optionally send portal invite
    if (sendInvite && form.contact_email) {
      try {
        const res = await fetch('/api/invite', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: form.contact_email, company_id: companyId }),
        });
        if (!res.ok) {
          const body = await res.json();
          setInviteNote(`Client created, but invite failed: ${body.error ?? 'unknown error'}`);
        }
      } catch {
        setInviteNote('Client created, but invite email could not be sent.');
      }
    }

    router.push(`/clients/${companyId}`);
  }

  return (
    <>
      <AdminTopbar title="New Client" actions={<button onClick={() => router.back()} className="btn-secondary btn-sm">Cancel</button>} />
      <main className="admin-page flex-1 max-w-[580px]">
        <form onSubmit={handleSubmit} className="card p-8 space-y-5">
          <div className="form-group">
            <label className="label">Company name *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)} className="input" placeholder="Acme Ltd" />
          </div>
          <div className="form-group">
            <label className="label">URL slug</label>
            <input value={form.slug} onChange={e => set('slug', e.target.value)} className="input" placeholder="e.g. acme-ltd (auto-generated if blank)" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="label">Sector</label>
              <select value={form.sector} onChange={e => set('sector', e.target.value)} className="input">
                <option value="">Select…</option>
                {SECTORS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Team size</label>
              <select value={form.size_band} onChange={e => set('size_band', e.target.value)} className="input">
                <option value="">Select…</option>
                {SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Primary contact email</label>
            <input
              type="email"
              value={form.contact_email}
              onChange={e => set('contact_email', e.target.value)}
              className="input"
              placeholder="contact@company.co.uk"
            />
          </div>

          {/* Monthly retainer — sets up the Stripe subscription on save */}
          <div
            className="rounded-[12px] p-4"
            style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.18)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <PoundSterling size={14} style={{ color: 'var(--purple)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Monthly retainer</p>
            </div>
            <div className="form-group mb-2">
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
                  style={{ color: 'var(--ink-faint)' }}
                >£</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={retainerPounds}
                  onChange={e => setRetainerPounds(e.target.value)}
                  className="input"
                  style={{ paddingLeft: 24 }}
                  placeholder="2500.00"
                />
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
              We&rsquo;ll create the Stripe customer and subscription with this monthly amount.
              Leave blank or set to 0 to skip billing setup for now &mdash; you can add it later.
              The client will receive a separate email from Stripe to add their payment method.
            </p>
          </div>

          {/* Invite toggle */}
          {form.contact_email && (
            <label
              className="flex items-center gap-3 rounded-[10px] px-4 py-3 cursor-pointer"
              style={{ background: sendInvite ? 'rgba(124,58,237,0.06)' : 'var(--surface-alt)', border: `1px solid ${sendInvite ? 'rgba(124,58,237,0.2)' : 'var(--line)'}` }}
            >
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={e => setSendInvite(e.target.checked)}
                className="w-4 h-4 accent-purple-600"
              />
              <Mail size={14} style={{ color: sendInvite ? 'var(--purple)' : 'var(--ink-faint)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Send portal invite</p>
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  Email {form.contact_email} a magic-link to set up their account
                </p>
              </div>
              {sendInvite && <CheckCircle2 size={14} className="ml-auto flex-shrink-0" style={{ color: 'var(--purple)' }} />}
            </label>
          )}

          {error      && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.08)',  color: 'var(--danger)' }}>{error}</p>}
          {stripeNote && (
            <p className="text-xs p-3 rounded-[8px] flex items-start gap-2" style={{ background: 'rgba(217,119,6,0.08)', color: 'var(--amber)' }}>
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              {stripeNote}
            </p>
          )}
          {inviteNote && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(217,119,6,0.08)', color: 'var(--amber)' }}>{inviteNote}</p>}

          <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading
              ? (sendInvite && form.contact_email ? 'Creating & sending invite…' : 'Creating…')
              : (sendInvite && form.contact_email ? 'Create Client & Send Invite' : 'Create Client')}
          </button>
          <p className="text-xs text-center" style={{ color: 'var(--ink-faint)' }}>
            Default feature flags applied. Adjust them on the client detail page.
          </p>
        </form>
      </main>
    </>
  );
}
