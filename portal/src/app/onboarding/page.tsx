'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle2, ArrowRight, Briefcase, FolderOpen, LifeBuoy } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';
const SECTORS = ['Retail & Hospitality','Technology & SaaS','Professional Services','Finance','Manufacturing','Healthcare','Logistics','Other'];
const SIZES   = ['10–24','25–49','50–99','100–249','250+'];

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [step,       setStep]       = useState<Step>(1);
  const [loading,    setLoading]    = useState(false);
  const [init,       setInit]       = useState(true);
  const [profile,    setProfile]    = useState<any>(null);
  const [company,    setCompany]    = useState<any>(null);
  const [form,       setForm]       = useState({ sector: '', size_band: '', full_name: '' });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth/login'); return; }

      const { data: p } = await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', user.id)
        .single();

      if (p?.onboarding_completed) { router.replace('/dashboard'); return; }

      setProfile(p);
      const c = (p as any)?.companies;
      setCompany(c);
      setForm({
        sector:    c?.sector    ?? '',
        size_band: c?.size_band ?? '',
        full_name: p?.full_name ?? '',
      });
      setInit(false);
    }
    load();
  }, []);

  function set(k: string, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await Promise.all([
      supabase.from('companies').update({
        sector:    form.sector    || null,
        size_band: form.size_band || null,
      }).eq('id', company?.id),
      supabase.from('profiles').update({
        full_name:       form.full_name || null,
        onboarding_step: 2,
      }).eq('id', profile?.id),
    ]);

    setLoading(false);
    setStep(2);
  }

  async function completeOnboarding(destination: string) {
    setLoading(true);
    await supabase.from('profiles').update({
      onboarding_completed: true,
      onboarding_step:      3,
    }).eq('id', profile?.id);
    router.push(destination);
  }

  if (init) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'var(--navy)' }}
    >
      {/* Glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(143,114,246,0.18) 0%, transparent 70%)' }}
      />

      <div className="relative w-full max-w-[520px]">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src={LOGO} alt="The People Office" width={130} height={44} className="h-10 w-auto brightness-110" priority />
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className="rounded-full transition-all duration-300"
              style={{
                width:      step === s ? '24px' : '8px',
                height:     '8px',
                background: step >= s ? 'var(--purple)' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>

        {/* ── Step 1: Confirm details ── */}
        {step === 1 && (
          <div
            className="rounded-[20px] p-8"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: 'rgba(143,114,246,0.8)' }}>
              Step 1 of 3
            </p>
            <h1 className="font-display font-bold text-2xl text-white mb-1">
              Welcome to your portal
            </h1>
            <p className="text-sm mb-7" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Let's confirm a few details about {company?.name ?? 'your organisation'}.
            </p>

            <form onSubmit={handleStep1} className="space-y-5">
              <div className="form-group">
                <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Your name</label>
                <input
                  value={form.full_name}
                  onChange={e => set('full_name', e.target.value)}
                  className="input"
                  placeholder="Jane Smith"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>
              <div className="form-group">
                <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Sector</label>
                <select
                  value={form.sector}
                  onChange={e => set('sector', e.target.value)}
                  className="input"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: form.sector ? '#fff' : 'rgba(255,255,255,0.35)' }}
                >
                  <option value="">Select your sector…</option>
                  {SECTORS.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Team size</label>
                <select
                  value={form.size_band}
                  onChange={e => set('size_band', e.target.value)}
                  className="input"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: form.size_band ? '#fff' : 'rgba(255,255,255,0.35)' }}
                >
                  <option value="">Select team size…</option>
                  {SIZES.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                </select>
              </div>

              <button type="submit" disabled={loading} className="btn-cta w-full justify-center mt-2">
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'Saving…' : <>Continue <ArrowRight size={14} /></>}
              </button>
            </form>
          </div>
        )}

        {/* ── Step 2: First action ── */}
        {step === 2 && (
          <div
            className="rounded-[20px] p-8"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: 'rgba(143,114,246,0.8)' }}>
              Step 2 of 3
            </p>
            <h1 className="font-display font-bold text-2xl text-white mb-1">
              What would you like to do first?
            </h1>
            <p className="text-sm mb-7" style={{ color: 'rgba(255,255,255,0.4)' }}>
              You can do all of this from your dashboard — pick where to start.
            </p>

            <div className="space-y-3">
              {[
                {
                  icon:  Briefcase,
                  label: 'Raise a role',
                  desc:  'Submit a new vacancy and we\'ll score it with Friction Lens.',
                  dest:  '/hire/hiring/new',
                  color: 'var(--purple)',
                },
                {
                  icon:  FolderOpen,
                  label: 'Upload a document',
                  desc:  'Add contracts, policies, or handbooks to your document centre.',
                  dest:  '/lead/documents',
                  color: 'var(--blue)',
                },
                {
                  icon:  LifeBuoy,
                  label: 'Raise a support query',
                  desc:  'Get HR advice, raise an ER case, or request a contract review.',
                  dest:  '/support/new',
                  color: 'var(--teal)',
                },
              ].map(({ icon: Icon, label, desc, dest, color }) => (
                <button
                  key={dest}
                  onClick={() => completeOnboarding(dest)}
                  disabled={loading}
                  className="w-full text-left rounded-[12px] p-4 flex items-center gap-4 transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}22` }}
                  >
                    <Icon size={18} style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
                  </div>
                  <ArrowRight size={14} className="ml-auto flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                </button>
              ))}
            </div>

            <button
              onClick={() => completeOnboarding('/dashboard')}
              disabled={loading}
              className="w-full mt-4 text-xs text-center"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Skip — take me to the dashboard
            </button>
          </div>
        )}

        {/* ── Step 3: (complete — redirect fires automatically) ── */}
        {step === 3 && (
          <div className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 size={40} style={{ color: 'var(--teal)' }} />
            <p className="text-white font-semibold text-lg">All set!</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Taking you there now…</p>
          </div>
        )}
      </div>
    </div>
  );
}
