'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, ArrowLeft, Loader2, CheckCircle2, Building2,
  UserPlus, Sliders, Users, CreditCard, Sparkles, Copy, Eye, EyeOff,
} from 'lucide-react';

interface Staff { id: string; full_name: string; role: string; }
interface Props { staff: Staff[]; }

const STEPS = [
  { num: 1, label: 'Company',    icon: Building2 },
  { num: 2, label: 'Account',    icon: UserPlus },
  { num: 3, label: 'Owner',      icon: Users },
  { num: 4, label: 'Modules',    icon: Sliders },
  { num: 5, label: 'Services',   icon: CreditCard },
  { num: 6, label: 'Complete',   icon: Sparkles },
];

const SECTORS = ['Retail & Hospitality','Technology & SaaS','Professional Services','Finance','Manufacturing','Healthcare','Logistics','Education','Construction','Other'];
const SIZES = ['1–9','10–24','25–49','50–99','100–249','250+'];

const MODULE_FLAGS = [
  { key: 'hiring',              label: 'HIRE — Recruitment Pipeline',    section: 'HIRE' },
  { key: 'friction_lens',       label: 'Friction Lens Scoring',          section: 'HIRE' },
  { key: 'benchmarks',          label: 'Salary Benchmarks',              section: 'HIRE' },
  { key: 'lead',                label: 'LEAD — People Development',      section: 'LEAD' },
  { key: 'employee_records',    label: 'Employee Records',               section: 'LEAD' },
  { key: 'onboarding',          label: 'Onboarding Workflows',           section: 'LEAD' },
  { key: 'org_chart',           label: 'Organisation Chart',             section: 'LEAD' },
  { key: 'learning',            label: 'E-Learning Marketplace',         section: 'LEAD' },
  { key: 'documents',           label: 'Document Management',            section: 'LEAD' },
  { key: 'protect',             label: 'PROTECT — Compliance & Risk',    section: 'PROTECT' },
  { key: 'compliance',          label: 'Compliance Tracking',            section: 'PROTECT' },
  { key: 'offboarding',         label: 'Offboarding Workflows',          section: 'PROTECT' },
  { key: 'policy_acknowledgement', label: 'Policy Acknowledgements',     section: 'PROTECT' },
  { key: 'support',             label: 'HR Support & Tickets',           section: 'General' },
  { key: 'calendar',            label: 'Company Calendar',               section: 'General' },
  { key: 'reports',             label: 'CSV Reports',                    section: 'General' },
  { key: 'metrics',             label: 'Metrics Dashboard',              section: 'General' },
];

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const special = '!@#$%&*';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  pw += special[Math.floor(Math.random() * special.length)];
  return pw;
}

export default function OnboardWizard({ staff }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  // Step 1 — Company
  const [company, setCompany] = useState({
    name: '', sector: '', size_band: '', contact_email: '', website: '',
  });

  // Step 2 — Portal Account
  const [account, setAccount] = useState({
    full_name: '', email: '', password: generatePassword(),
  });

  // Step 3 — Account Owner
  const [ownerId, setOwnerId] = useState('');

  // Step 4 — Feature Flags
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    const f: Record<string, boolean> = {};
    MODULE_FLAGS.forEach(m => { f[m.key] = ['hiring', 'lead', 'protect', 'support', 'documents', 'compliance', 'employee_records', 'calendar'].includes(m.key); });
    return f;
  });

  // Step 5 — Services
  const [services, setServices] = useState<{ name: string; tier: string; fee: string }[]>([
    { name: '', tier: '', fee: '' },
  ]);

  function toggleFlag(key: string) {
    setFlags(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function copyCredentials() {
    const text = `Portal Login Credentials\nEmail: ${account.email}\nPassword: ${account.password}\nURL: ${window.location.origin.replace('admin', 'portal') || 'https://portal.thepeoplesystem.co.uk'}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function createCompany() {
    if (!company.name.trim()) { setError('Company name is required'); return false; }
    setSaving(true); setError('');

    const slug = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { data, error: err } = await supabase.from('companies').insert({
      name: company.name.trim(),
      slug,
      sector: company.sector || null,
      size_band: company.size_band || null,
      contact_email: company.contact_email || account.email || null,
      active: true,
      onboarding_status: 'in_progress',
      account_owner_id: ownerId || null,
    }).select().single();

    if (err) { setError(err.message); setSaving(false); return false; }
    setCreatedCompanyId((data as any).id);
    setSaving(false);
    return (data as any).id;
  }

  async function createUser(companyId: string) {
    if (!account.email || !account.password) { setError('Email and password are required'); return false; }
    setSaving(true); setError('');

    const res = await fetch('/api/create-client-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        company_id: companyId,
        full_name: account.full_name || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? 'Failed to create user');
      setSaving(false);
      return false;
    }
    setSaving(false);
    return true;
  }

  async function saveServices(companyId: string) {
    const validServices = services.filter(s => s.name.trim());
    if (validServices.length === 0) return;

    await supabase.from('client_services').insert(
      validServices.map(s => ({
        company_id: companyId,
        service_name: s.name.trim(),
        service_tier: s.tier || null,
        monthly_fee: s.fee ? parseFloat(s.fee) : 0,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0],
      }))
    );
  }

  async function completeOnboarding(companyId: string) {
    await supabase.from('companies').update({
      feature_flags: flags,
      account_owner_id: ownerId || null,
      onboarding_status: 'completed',
    }).eq('id', companyId);
  }

  async function handleNext() {
    setError('');

    if (step === 1) {
      if (!company.name.trim()) { setError('Company name is required'); return; }
      setStep(2);
    } else if (step === 2) {
      if (!account.email) { setError('Email is required'); return; }
      if (account.password.length < 8) { setError('Password must be at least 8 characters'); return; }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    } else if (step === 5) {
      // Create everything
      setSaving(true);
      const companyId = createdCompanyId ?? await createCompany();
      if (!companyId) return;

      const userOk = await createUser(companyId);
      if (!userOk) return;

      await saveServices(companyId);
      await completeOnboarding(companyId);
      setSaving(false);
      setStep(6);
    }
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  const sections = [...new Set(MODULE_FLAGS.map(f => f.section))];

  return (
    <div className="w-full max-w-[640px]">
      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((s, i) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          const Icon = s.icon;
          return (
            <div key={s.num} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-center w-full">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: isDone ? 'var(--success)' : isActive ? 'var(--purple)' : 'var(--surface-alt)',
                    color: isDone || isActive ? '#fff' : 'var(--ink-faint)',
                  }}
                >
                  {isDone ? <CheckCircle2 size={14} /> : <Icon size={13} />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1" style={{ background: isDone ? 'var(--success)' : 'var(--line)' }} />
                )}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: isActive ? 'var(--purple)' : 'var(--ink-faint)' }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="card p-6">

        {/* ── Step 1: Company ──────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg mb-1" style={{ color: 'var(--ink)' }}>Company Details</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Basic information about the client company.</p>
            </div>
            <div className="form-group">
              <label className="label">Company Name *</label>
              <input className="input" value={company.name} onChange={e => setCompany(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Acme Ltd" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="label">Sector</label>
                <select className="input" value={company.sector} onChange={e => setCompany(f => ({ ...f, sector: e.target.value }))}>
                  <option value="">Select...</option>
                  {SECTORS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Team Size</label>
                <select className="input" value={company.size_band} onChange={e => setCompany(f => ({ ...f, size_band: e.target.value }))}>
                  <option value="">Select...</option>
                  {SIZES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Contact Email</label>
              <input className="input" type="email" value={company.contact_email} onChange={e => setCompany(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@company.co.uk" />
            </div>
          </div>
        )}

        {/* ── Step 2: Portal Account ──────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg mb-1" style={{ color: 'var(--ink)' }}>Portal Login</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Create the client's admin login. You can email these credentials to them externally.</p>
            </div>
            <div className="form-group">
              <label className="label">Contact Full Name</label>
              <input className="input" value={account.full_name} onChange={e => setAccount(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Sarah Johnson" />
            </div>
            <div className="form-group">
              <label className="label">Login Email *</label>
              <input className="input" type="email" value={account.email} onChange={e => setAccount(f => ({ ...f, email: e.target.value }))} placeholder="sarah@company.co.uk" />
            </div>
            <div className="form-group">
              <label className="label">Password *</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    className="input pr-10"
                    type={showPassword ? 'text' : 'password'}
                    value={account.password}
                    onChange={e => setAccount(f => ({ ...f, password: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setAccount(f => ({ ...f, password: generatePassword() }))}
                  className="btn-secondary btn-sm"
                >
                  Generate
                </button>
              </div>
            </div>

            {/* Copy credentials box */}
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Login Credentials</p>
                <button onClick={copyCredentials} className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'var(--purple)' }}>
                  <Copy size={10} /> {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs font-mono" style={{ color: 'var(--ink-soft)' }}>
                Email: {account.email || '—'}<br />
                Password: {account.password}
              </p>
              <p className="text-[10px] mt-2" style={{ color: 'var(--ink-faint)' }}>
                Send these to the client via email. They can change their password after first login.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 3: Account Owner ───────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg mb-1" style={{ color: 'var(--ink)' }}>Account Manager</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Assign a TPS team member as the primary contact for this client.</p>
            </div>
            <div className="space-y-2">
              {staff.map(s => (
                <label
                  key={s.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    border: `1px solid ${ownerId === s.id ? 'var(--purple)' : 'var(--line)'}`,
                    background: ownerId === s.id ? 'rgba(124,58,237,0.04)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="owner"
                    value={s.id}
                    checked={ownerId === s.id}
                    onChange={() => setOwnerId(s.id)}
                    className="w-4 h-4"
                  />
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}
                  >
                    {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{s.full_name || 'Unnamed'}</p>
                    <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{s.role === 'tps_admin' ? 'Admin' : 'Recruiter'}</p>
                  </div>
                </label>
              ))}
              {staff.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--ink-faint)' }}>No TPS staff found. You can assign an owner later.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 4: Modules / Feature Flags ─────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg mb-1" style={{ color: 'var(--ink)' }}>Portal Modules</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Choose which features this client can access. Toggle on what they're paying for.</p>
            </div>
            {sections.map(section => (
              <div key={section}>
                <p className="eyebrow mb-2">{section}</p>
                <div className="space-y-1">
                  {MODULE_FLAGS.filter(f => f.section === section).map(flag => (
                    <label
                      key={flag.key}
                      className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--surface-soft)]"
                    >
                      <span className="text-sm" style={{ color: flags[flag.key] ? 'var(--ink)' : 'var(--ink-faint)' }}>
                        {flag.label}
                      </span>
                      <div
                        className={`toggle ${flags[flag.key] ? 'toggle-on' : 'toggle-off'}`}
                        style={{ transform: 'scale(0.85)' }}
                        onClick={() => toggleFlag(flag.key)}
                      >
                        <div className={`toggle-knob ${flags[flag.key] ? 'toggle-knob-on' : 'toggle-knob-off'}`} />
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 5: Services & Billing ──────────────── */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg mb-1" style={{ color: 'var(--ink)' }}>Services & Billing</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Add the services this client is subscribed to. You can skip this and add later.</p>
            </div>
            <div className="space-y-3">
              {services.map((svc, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <input className="input" placeholder="Service name" value={svc.name} onChange={e => {
                    const u = [...services]; u[i] = { ...u[i], name: e.target.value }; setServices(u);
                  }} />
                  <input className="input" placeholder="Tier (optional)" value={svc.tier} onChange={e => {
                    const u = [...services]; u[i] = { ...u[i], tier: e.target.value }; setServices(u);
                  }} />
                  <input className="input" type="number" placeholder="Monthly fee £" value={svc.fee} onChange={e => {
                    const u = [...services]; u[i] = { ...u[i], fee: e.target.value }; setServices(u);
                  }} />
                </div>
              ))}
            </div>
            <button
              onClick={() => setServices(prev => [...prev, { name: '', tier: '', fee: '' }])}
              className="btn-ghost btn-sm"
            >
              + Add another service
            </button>
          </div>
        )}

        {/* ── Step 6: Complete ────────────────────────── */}
        {step === 6 && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(16,185,129,0.12)' }}>
              <CheckCircle2 size={28} style={{ color: 'var(--success)' }} />
            </div>
            <h3 className="font-display text-xl mb-2" style={{ color: 'var(--ink)' }}>Client Onboarded</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--ink-soft)' }}>
              <strong>{company.name}</strong> is ready to go.
            </p>
            <p className="text-xs mb-6" style={{ color: 'var(--ink-faint)' }}>
              Portal account created for {account.email}. Send them the credentials to get started.
            </p>

            {/* Credentials reminder */}
            <div className="rounded-lg p-4 mb-6 text-left mx-auto max-w-sm" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Credentials</p>
                <button onClick={copyCredentials} className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'var(--purple)' }}>
                  <Copy size={10} /> {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs font-mono" style={{ color: 'var(--ink-soft)' }}>
                Email: {account.email}<br />
                Password: {account.password}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button onClick={() => router.push(`/clients/${createdCompanyId}`)} className="btn-cta btn-sm">
                View Client Profile
              </button>
              <button onClick={() => { setStep(1); setCreatedCompanyId(null); setCompany({ name: '', sector: '', size_band: '', contact_email: '', website: '' }); setAccount({ full_name: '', email: '', password: generatePassword() }); }} className="btn-secondary btn-sm">
                Onboard Another
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-xs p-3 mt-4 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger)' }}>{error}</p>}

        {/* Navigation */}
        {step < 6 && (
          <div className="flex items-center justify-between mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
            {step > 1 ? (
              <button onClick={handleBack} className="btn-ghost btn-sm">
                <ArrowLeft size={13} /> Back
              </button>
            ) : <div />}
            <button
              onClick={handleNext}
              disabled={saving}
              className="btn-cta btn-sm"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              {step === 5 ? 'Create Client' : 'Next'}
              {step < 5 && <ArrowRight size={13} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
