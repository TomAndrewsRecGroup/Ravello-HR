'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2, CheckCircle2, ArrowRight, ArrowLeft, Send,
  UserPlus, Users, Mail, Briefcase, Calendar, SkipForward,
} from 'lucide-react';
import FrictionLensClient from '../(portal)/hire/friction-lens/FrictionLensClient';
import type { CompanyAssessment } from '@/lib/supabase/types';

const LOGO    = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';
const SECTORS = ['Retail & Hospitality','Technology & SaaS','Professional Services','Finance','Manufacturing','Healthcare','Logistics','Other'];
// Keep this in sync with admin/src/app/(admin)/clients/onboard/OnboardWizard.tsx
// and portal/src/components/modules/SettingsForm.tsx — same bands so a
// client picks the same size everywhere they're asked.
const SIZES   = ['1-9','10-24','25-49','50-99','100-249','250+'];

type Step = 1 | 2 | 3 | 4 | 5;
const TOTAL_STEPS = 5;

// Each step has a label rendered in the progress bar (only shown ≥md to
// keep mobile compact) and a "required to leave the step" flag — the
// wizard refuses to advance past a required step until it succeeds.
const STEPS: Array<{ n: Step; label: string; required: boolean }> = [
  { n: 1, label: 'Welcome',         required: true  },
  { n: 2, label: 'Friction Lens',   required: true  },
  { n: 3, label: 'Invite Editor',   required: false },
  { n: 4, label: 'First employee',  required: true  },
  { n: 5, label: 'Done',            required: true  },
];

export default function OnboardingPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [step,    setStep]    = useState<Step>(1);
  const [init,    setInit]    = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [assessment, setAssessment] = useState<CompanyAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Step-1 form
  const [welcome, setWelcome] = useState({ full_name: '', sector: '', size_band: '' });
  // Step-3 form
  const [invite,  setInvite]  = useState({ email: '', full_name: '' });
  const [inviteSent, setInviteSent] = useState(false);
  // Step-4 form
  const [employee, setEmployee] = useState({ full_name: '', email: '', job_title: '', start_date: '' });

  // Surfaces a fatal load failure with a clear message + sign-out
  // CTA, so the user never gets stuck on a "session expired" toast
  // they can't escape from. Set when profile or company can't load.
  const [fatal, setFatal] = useState<string | null>(null);

  // ── Initial load: profile + company + any existing assessment ──
  // Fetched as three SEPARATE queries instead of one joined SELECT.
  // The previous joined query (profiles ⨝ companies) could return
  // null silently if RLS blocked the embedded company resource —
  // dropping the user on a form with profile=null and stuck on
  // "session expired" with no recovery path. Splitting the query
  // means a company-RLS quirk doesn't take the profile down with it.
  useEffect(() => {
    (async () => {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) { router.replace('/auth/login'); return; }

      // 1. Profile (no joins — own_profile RLS allows id = auth.uid())
      const { data: p, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, onboarding_completed, onboarding_step, role, company_id')
        .eq('id', user.id)
        .single();

      if (pErr || !p) {
        // Real failure — RLS or DB state. Show recovery UI rather than
        // a useless "session expired" form.
        setFatal(pErr?.message
          ? `Couldn't load your profile: ${pErr.message}`
          : 'Your profile could not be found. Please contact The People System.');
        setInit(false);
        return;
      }

      if (p.onboarding_completed) {
        router.replace('/dashboard');
        return;
      }

      // 2. Company (only if linked) and 3. Most-recent assessment, in parallel.
      const [companyRes, assessmentRes] = await Promise.all([
        p.company_id
          ? supabase
              .from('companies')
              .select('id, name, sector, size_band, contact_email, ivylens_company_id')
              .eq('id', p.company_id)
              .single()
          : Promise.resolve({ data: null, error: null } as any),
        supabase
          .from('company_assessments')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const c = companyRes.data ?? null;
      const a = assessmentRes.data ?? null;

      if (!c) {
        // Profile loaded but no company — was the bug pre-47fe03e.
        // Surface it so the user knows what to do rather than seeing
        // a generic "session expired" on save.
        setFatal('Your account isn\'t linked to a company yet. Contact The People System to finish setup.');
        setInit(false);
        return;
      }

      setProfile(p);
      setCompany(c);
      setAssessment(a as CompanyAssessment | null);
      setWelcome({
        full_name: p.full_name ?? '',
        sector:    c.sector    ?? '',
        size_band: c.size_band ?? '',
      });

      // Resume on the saved step (clamped 1..5)
      const saved = Math.max(1, Math.min(TOTAL_STEPS, p.onboarding_step ?? 1)) as Step;
      setStep(saved);
      setInit(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist current step to profiles so a refresh resumes here.
  async function persistStep(next: Step) {
    if (!profile?.id) return;
    await supabase.from('profiles').update({ onboarding_step: next }).eq('id', profile.id);
  }

  function goTo(next: Step) {
    setError('');
    setStep(next);
    persistStep(next);
  }

  // ── Step actions ─────────────────────────────────────────────
  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!welcome.sector || !welcome.size_band) {
      setError('Please pick a sector and team size.');
      return;
    }
    // Guard against null profile / company. Without these we'd hit
    // "Cannot read properties of null (reading 'id')" — the spinner-
    // stuck bug the user saw. Profile is null when the initial
    // session lookup fails (RLS, expired session). Company is null
    // when the user's profile.company_id wasn't backfilled — the
    // legacy bug closed in commit 47fe03e.
    if (!profile?.id) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    if (!company?.id) {
      setError('No company is linked to your account yet. Contact The People System to get this set up before continuing.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [pRes, cRes] = await Promise.all([
        supabase.from('profiles')
          .update({ full_name: welcome.full_name || null })
          .eq('id', profile.id),
        supabase.from('companies')
          .update({ sector: welcome.sector, size_band: welcome.size_band })
          .eq('id', company.id),
      ]);
      if (pRes.error || cRes.error) {
        setError(pRes.error?.message ?? cRes.error?.message ?? 'Could not save. Please try again.');
        return;
      }
      goTo(2);
    } catch (err: any) {
      // Network / supabase-js JS exception. Always clear the spinner.
      setError(err?.message ?? 'Could not save. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function onAssessmentCreated(a: CompanyAssessment) {
    setAssessment(a);
    // Don't auto-advance — let them read the result, click Continue.
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!invite.email) { setError('Email is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/portal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invite),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not send invite.');
      setInviteSent(true);
      setTimeout(() => goTo(4), 800);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!employee.full_name.trim()) { setError('Employee name is required.'); return; }
    if (!employee.start_date)        { setError('Start date is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employee),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save employee.');
      goTo(5);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 5: mark complete + redirect.
  // The session cookie set by middleware caches onboarding_completed
  // on a 15-min TTL. After we flip the DB to true we MUST clear the
  // cookie before navigating — otherwise /dashboard layout reads the
  // stale cookie (false), bounces to /onboarding, which fetches the
  // fresh DB (true), bounces to /dashboard… infinite loop, thousands
  // of console logs, the symptom the user reported.
  // Using window.location.href for the navigation also ensures the
  // browser issues a fresh document request (re-running middleware)
  // rather than a soft client-side route — soft routes don't always
  // re-evaluate the layout on Next 14.
  const completedRef = useRef(false);
  useEffect(() => {
    if (step !== 5 || completedRef.current || !profile?.id) return;
    completedRef.current = true;
    (async () => {
      await supabase.from('profiles').update({
        onboarding_completed: true,
        onboarding_step:      TOTAL_STEPS,
      }).eq('id', profile.id);
      // Invalidate the cached session cookie so the next request
      // re-stamps it with onboarding_completed = true.
      try {
        await fetch('/api/portal/refresh-session', { method: 'POST' });
      } catch {
        // Best effort — failure here just means the layout will
        // do one extra redirect cycle (cap'd by the 15-min TTL).
      }
      // Tiny delay so the success state is visible.
      setTimeout(() => { window.location.href = '/dashboard'; }, 1400);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, profile?.id]);

  // ── Render ───────────────────────────────────────────────────
  if (init) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAF8' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ink-faint)' }} />
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px]">
          <div className="flex justify-center mb-6">
            <Image src={LOGO} alt="The People System" width={130} height={44} className="h-10 w-auto" priority />
          </div>
          <div className="rounded-[20px] p-7" style={{ background: '#FFFFFF', border: '1px solid var(--line)' }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--red)' }}>
              Account setup needed
            </p>
            <h1 className="font-display font-bold text-lg mb-2" style={{ color: '#0A0F1E' }}>
              We can&rsquo;t continue right now
            </h1>
            <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>{fatal}</p>
            <div className="flex flex-col gap-2">
              <a href="mailto:hello@thepeoplesystem.co.uk" className="btn-cta justify-center">
                Contact support
              </a>
              <form action="/auth/signout" method="post">
                <button type="submit" className="btn-secondary w-full justify-center">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4" style={{ background: '#FAFAF8' }}>
      <div className="w-full max-w-[640px]">

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image src={LOGO} alt="The People System" width={130} height={44} className="h-10 w-auto" priority />
        </div>

        {/* Progress bar */}
        <div className="flex items-center justify-center gap-1.5 mb-7">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-full transition-all duration-300"
              style={{
                width:      step === s.n ? '28px' : (step > s.n ? '12px' : '8px'),
                height:     '8px',
                background: step >= s.n ? 'var(--purple)' : '#D1D5DB',
              }}
              aria-label={`Step ${s.n}: ${s.label}`}
            />
          ))}
        </div>

        {/* ── Step 1: Welcome / company confirm ── */}
        {step === 1 && (
          <Card>
            <Eyebrow>Step 1 of {TOTAL_STEPS}</Eyebrow>
            <h1 className="font-display font-bold text-2xl mb-1" style={{ color: '#0A0F1E' }}>
              Welcome to your portal
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
              Let&rsquo;s set you up properly. Five quick steps and you&rsquo;ll be ready to go.
            </p>
            <form onSubmit={handleStep1} className="space-y-4">
              <Field label="Your name">
                <input
                  className="input"
                  value={welcome.full_name}
                  onChange={e => setWelcome(w => ({ ...w, full_name: e.target.value }))}
                  placeholder="Jane Smith"
                />
              </Field>
              <Field label="Sector">
                <select
                  className="input"
                  value={welcome.sector}
                  onChange={e => setWelcome(w => ({ ...w, sector: e.target.value }))}
                >
                  <option value="">Select your sector…</option>
                  {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Team size">
                <select
                  className="input"
                  value={welcome.size_band}
                  onChange={e => setWelcome(w => ({ ...w, size_band: e.target.value }))}
                >
                  <option value="">Select team size…</option>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              {error && <ErrorBanner>{error}</ErrorBanner>}
              <button type="submit" disabled={loading} className="btn-cta w-full justify-center mt-2">
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'Saving…' : <>Continue <ArrowRight size={14} /></>}
              </button>
            </form>
          </Card>
        )}

        {/* ── Step 2: Friction Lens ── */}
        {step === 2 && (
          <Card>
            <Eyebrow>Step 2 of {TOTAL_STEPS}</Eyebrow>
            <h1 className="font-display font-bold text-2xl mb-1" style={{ color: '#0A0F1E' }}>
              Get your Company Friction Score
            </h1>
            <p className="text-sm mb-2" style={{ color: 'var(--ink-soft)' }}>
              Five questions about your business. We&rsquo;ll score how hard hiring will be for you right now and tell you which dimensions are dragging you down.
            </p>
            <p className="text-xs mb-6" style={{ color: 'var(--ink-faint)' }}>
              Takes about 5 minutes. You can update it any time from the portal.
            </p>

            {/* Embed the existing FrictionLensClient. It handles its own
                form, IvyLens registration, and assessment storage. We
                listen for completion via onAssessmentCreated. */}
            <div className="-mx-2">
              <FrictionLensClient
                initialAssessment={assessment}
                company={company}
                onAssessmentCreated={onAssessmentCreated}
              />
            </div>

            <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
              <button
                onClick={() => goTo(1)}
                className="text-xs flex items-center gap-1"
                style={{ color: 'var(--ink-faint)' }}
              >
                <ArrowLeft size={12} /> Back
              </button>
              <button
                onClick={() => goTo(3)}
                disabled={!assessment}
                className="btn-cta btn-sm"
                title={!assessment ? 'Please complete the Friction Lens form first.' : ''}
              >
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </Card>
        )}

        {/* ── Step 3: Invite Editor (optional) ── */}
        {step === 3 && (
          <Card>
            <Eyebrow>Step 3 of {TOTAL_STEPS} · Optional</Eyebrow>
            <h1 className="font-display font-bold text-2xl mb-1" style={{ color: '#0A0F1E' }}>
              Invite a teammate
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
              You can give one teammate Editor access. They can add and edit, but cannot delete documents or manage users. You can skip and come back to this later.
            </p>
            <form onSubmit={sendInvite} className="space-y-4">
              <Field label="Their email">
                <input
                  type="email"
                  className="input"
                  value={invite.email}
                  onChange={e => setInvite(i => ({ ...i, email: e.target.value }))}
                  placeholder="teammate@yourcompany.com"
                  required
                />
              </Field>
              <Field label="Their name (optional)">
                <input
                  className="input"
                  value={invite.full_name}
                  onChange={e => setInvite(i => ({ ...i, full_name: e.target.value }))}
                  placeholder="Sam Jones"
                />
              </Field>
              {error && <ErrorBanner>{error}</ErrorBanner>}
              {inviteSent && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--emerald)' }}>
                  <CheckCircle2 size={16} /> Invite sent. Continuing…
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <button type="submit" disabled={loading || inviteSent} className="btn-cta flex-1 justify-center">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {loading ? 'Sending…' : 'Send invite'}
                </button>
                <button
                  type="button"
                  onClick={() => goTo(4)}
                  disabled={loading}
                  className="btn-secondary justify-center sm:w-auto"
                >
                  <SkipForward size={14} /> Skip for now
                </button>
              </div>
            </form>
            <button
              onClick={() => goTo(2)}
              className="mt-4 text-xs flex items-center gap-1"
              style={{ color: 'var(--ink-faint)' }}
            >
              <ArrowLeft size={12} /> Back
            </button>
          </Card>
        )}

        {/* ── Step 4: Add first employee ── */}
        {step === 4 && (
          <Card>
            <Eyebrow>Step 4 of {TOTAL_STEPS}</Eyebrow>
            <h1 className="font-display font-bold text-2xl mb-1" style={{ color: '#0A0F1E' }}>
              Add your first employee
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
              We need at least one to enable leave requests, employee records, and reporting. Just the basics &mdash; you can fill in the rest later from the Employee Records page.
            </p>
            <form onSubmit={addEmployee} className="space-y-4">
              <Field label="Full name *" icon={Users}>
                <input
                  className="input"
                  value={employee.full_name}
                  onChange={e => setEmployee(emp => ({ ...emp, full_name: e.target.value }))}
                  placeholder="Alex Thompson"
                  required
                />
              </Field>
              <Field label="Job title" icon={Briefcase}>
                <input
                  className="input"
                  value={employee.job_title}
                  onChange={e => setEmployee(emp => ({ ...emp, job_title: e.target.value }))}
                  placeholder="Operations Manager"
                />
              </Field>
              <Field label="Email" icon={Mail}>
                <input
                  type="email"
                  className="input"
                  value={employee.email}
                  onChange={e => setEmployee(emp => ({ ...emp, email: e.target.value }))}
                  placeholder="alex@yourcompany.com"
                />
              </Field>
              <Field label="Start date *" icon={Calendar}>
                <input
                  type="date"
                  className="input"
                  value={employee.start_date}
                  onChange={e => setEmployee(emp => ({ ...emp, start_date: e.target.value }))}
                  required
                />
              </Field>
              {error && <ErrorBanner>{error}</ErrorBanner>}
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <button type="submit" disabled={loading} className="btn-cta flex-1 justify-center">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  {loading ? 'Saving…' : 'Save and finish'}
                </button>
              </div>
            </form>
            <button
              onClick={() => goTo(3)}
              className="mt-4 text-xs flex items-center gap-1"
              style={{ color: 'var(--ink-faint)' }}
            >
              <ArrowLeft size={12} /> Back
            </button>
          </Card>
        )}

        {/* ── Step 5: Done ── */}
        {step === 5 && (
          <div className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 size={48} style={{ color: 'var(--teal)' }} />
            <p className="font-display font-bold text-2xl" style={{ color: '#0A0F1E' }}>You&rsquo;re all set.</p>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Welcome to The People System. Taking you to your dashboard now…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Small layout helpers ──────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[20px] p-7"
      style={{ background: '#FFFFFF', border: '1px solid var(--line)', boxShadow: '0 1px 3px rgba(13,21,53,0.04)' }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--purple)' }}>
      {children}
    </p>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: React.ComponentType<any>; children: React.ReactNode }) {
  return (
    <div className="form-group">
      <label className="label flex items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
        {Icon ? <Icon size={12} /> : null}
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] p-3 text-sm"
      style={{ background: 'rgba(217,68,68,0.06)', border: '1px solid rgba(217,68,68,0.20)', color: 'var(--red)' }}
    >
      {children}
    </div>
  );
}
