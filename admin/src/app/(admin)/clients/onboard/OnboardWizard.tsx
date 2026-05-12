'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, ArrowLeft, Loader2, CheckCircle2, Building2,
  Sliders, Users, PoundSterling, Mail, Sparkles,
  Trophy, Lock, AlertTriangle,
} from 'lucide-react';
import { FLAG_GROUPS, hasPaidFlag } from '@/lib/featureFlags';
import { SECTORS } from '@/lib/sectors';

// Onboard wizard — the SINGLE path for adding a new client.
//
// Calls the canonical /api/admin/clients endpoint, which handles:
//   • feature_flags + PAID/FREE detection
//   • Stripe customer + subscription setup (only when paid modules
//     are on AND a non-zero retainer is set)
//   • account_owner_id assignment
//   • welcome email via Resend
//
// Then optionally calls /api/invite to send a branded magic-link
// invite to the contact email — that lands the new admin on the
// /auth/update-password?welcome=1 flow so they set their own password.
//
// The old /clients/new page redirects here.

interface Staff { id: string; full_name: string; role: string; }
interface Props { staff: Staff[]; }

const STEPS = [
  { num: 1, label: 'Company',  icon: Building2 },
  { num: 2, label: 'Modules',  icon: Sliders },
  { num: 3, label: 'Billing',  icon: PoundSterling },
  { num: 4, label: 'Owner',    icon: Users },
  { num: 5, label: 'Review',   icon: Mail },
  { num: 6, label: 'Done',     icon: Sparkles },
];

const SIZES = ['1-9','10-24','25-49','50-99','100-249','250+'];

// Sensible defaults for a typical paying client. Admin can tick more
// in step 2; nothing is forced.
const DEFAULT_PAID_ON: Record<string, boolean> = {
  hiring: true, lead: true, protect: true,
  documents: true, support: true, compliance: true,
};

function initialFlags(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const group of FLAG_GROUPS) {
    for (const f of group.flags) {
      out[f.key] = !!DEFAULT_PAID_ON[f.key];
    }
  }
  return out;
}

export default function OnboardWizard({ staff }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [stripeNote, setStripeNote] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [manatalNote, setManatalNote] = useState('');
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);

  const [company, setCompany] = useState({
    name: '', slug: '', sector: '', size_band: '', contact_email: '',
  });
  const [flags, setFlags] = useState<Record<string, boolean>>(initialFlags);
  const [retainerPounds, setRetainerPounds] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [sendInvite, setSendInvite] = useState(true);

  const paidEnabled = useMemo(() => hasPaidFlag(flags), [flags]);
  const enabledFlags = useMemo(
    () => FLAG_GROUPS.flatMap(g => g.flags).filter(f => flags[f.key]),
    [flags],
  );

  function toggleFlag(k: string) {
    setFlags(prev => ({ ...prev, [k]: !prev[k] }));
  }
  function toggleGroup(groupLabel: string, on: boolean) {
    const group = FLAG_GROUPS.find(g => g.label === groupLabel);
    if (!group) return;
    setFlags(prev => {
      const next = { ...prev };
      for (const f of group.flags) next[f.key] = on;
      return next;
    });
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  function handleNext() {
    setError('');
    if (step === 1) {
      if (!company.name.trim()) { setError('Company name is required.'); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (enabledFlags.length === 0) {
        setError('Select at least one module. The client needs something in their portal.');
        return;
      }
      // Skip the billing step entirely if no paid modules — free-only
      // clients never see Stripe.
      setStep(paidEnabled ? 3 : 4);
      return;
    }
    if (step === 3) {
      // Retainer is optional even when paid is on — admin can set it later.
      setStep(4);
      return;
    }
    if (step === 4) { setStep(5); return; }
    if (step === 5) { handleSubmit(); }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    setStripeNote('');
    setInviteNote('');
    setManatalNote('');

    const retainerNum   = parseFloat(retainerPounds);
    const retainerPence = paidEnabled && !isNaN(retainerNum) && retainerNum > 0
      ? Math.round(retainerNum * 100)
      : null;

    let companyId: string;
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:                   company.name.trim(),
          slug:                   company.slug.trim() || undefined,
          sector:                 company.sector || null,
          size_band:              company.size_band || null,
          contact_email:          company.contact_email || null,
          monthly_retainer_pence: retainerPence,
          feature_flags:          flags,
          account_owner_id:       ownerId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not create client.');
        setSubmitting(false);
        return;
      }
      companyId = data.company_id;
      setCreatedCompanyId(companyId);
      if (data.stripe?.error) {
        setStripeNote(`Client created but Stripe billing setup failed: ${data.stripe.error}. Retry from the client profile.`);
      }
      if (data.manatal?.error) {
        setManatalNote(`Client created but Manatal org create failed: ${data.manatal.error}. Set the Manatal ID manually on the client profile or retry.`);
      } else if (data.manatal === undefined) {
        // Server didn't run the Manatal step at all — surfaces when the
        // build is older than the Manatal integration or the env key is
        // missing on this deployment. Check /api/manatal/diag.
        setManatalNote('Heads-up: this deployment did not attempt Manatal org create. Visit /api/manatal/diag for runtime diagnostics.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Network error.');
      setSubmitting(false);
      return;
    }

    if (sendInvite && company.contact_email) {
      try {
        const inv = await fetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: company.contact_email, company_id: companyId }),
        });
        const body = await inv.json().catch(() => ({}));
        if (!inv.ok) {
          setInviteNote(`Client created but invite failed: ${body.error ?? 'unknown error'}`);
        } else if (body.email_sent === false) {
          setInviteNote(
            `Client created and invite link generated, but the email did not send. ${body.email_warning ?? ''} Activation link: ${body.activate_url ?? 'see profile'}`,
          );
        }
      } catch {
        setInviteNote('Client created but the invite email could not be sent.');
      }
    }

    setSubmitting(false);
    setStep(6);
  }

  return (
    <div className="w-full max-w-[680px]">
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
                    background: isDone ? 'var(--teal)' : isActive ? 'var(--purple)' : 'var(--surface-alt)',
                    color: isDone || isActive ? '#fff' : 'var(--ink-faint)',
                  }}
                >
                  {isDone ? <CheckCircle2 size={14} /> : <Icon size={13} />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1" style={{ background: isDone ? 'var(--teal)' : 'var(--line)' }} />
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
      <div className="card p-7">

        {/* ── 1. Company ────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>Company details</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>The basics. You can edit any of this later from the client profile.</p>
            </div>
            <div className="form-group">
              <label className="label">Company name *</label>
              <input className="input" value={company.name} onChange={e => setCompany(f => ({ ...f, name: e.target.value }))} placeholder="Acme Ltd" />
            </div>
            <div className="form-group">
              <label className="label">URL slug</label>
              <input className="input" value={company.slug} onChange={e => setCompany(f => ({ ...f, slug: e.target.value }))} placeholder="acme-ltd (auto-generated if blank)" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="label">Sector</label>
                <select className="input" value={company.sector} onChange={e => setCompany(f => ({ ...f, sector: e.target.value }))}>
                  <option value="">Select…</option>
                  {SECTORS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Team size</label>
                <select className="input" value={company.size_band} onChange={e => setCompany(f => ({ ...f, size_band: e.target.value }))}>
                  <option value="">Select…</option>
                  {SIZES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Primary contact email</label>
              <input className="input" type="email" value={company.contact_email} onChange={e => setCompany(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@company.co.uk" />
              <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                We&rsquo;ll send the welcome email and (if enabled) the portal invite here.
              </p>
            </div>
          </div>
        )}

        {/* ── 2. Modules ────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>Module access</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                Tick what this client gets in their portal. Free-tier modules don&rsquo;t trigger any billing.
              </p>
            </div>
            {FLAG_GROUPS.map(group => {
              const isFree = group.tier === 'free';
              const groupOn   = group.flags.filter(f => flags[f.key]).length;
              const allOn     = groupOn === group.flags.length;
              return (
                <div
                  key={group.label}
                  className="rounded-[10px] p-4"
                  style={{
                    background: isFree ? 'rgba(20,184,166,0.04)' : 'var(--surface-soft)',
                    border:     `1px solid ${isFree ? 'rgba(20,184,166,0.18)' : 'var(--line)'}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {isFree
                      ? <Trophy size={14} style={{ color: 'var(--teal)'   }} />
                      : <Lock   size={14} style={{ color: 'var(--purple)' }} />}
                    <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{group.label}</p>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                      style={{
                        background: isFree ? 'rgba(20,184,166,0.12)' : 'rgba(124,58,237,0.10)',
                        color:      isFree ? 'var(--teal)'           : 'var(--purple)',
                      }}
                    >
                      {isFree ? 'Free' : 'Paid'}
                    </span>
                    <span className="ml-auto text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>
                      {groupOn}/{group.flags.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label, !allOn)}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      style={{
                        background: allOn ? 'rgba(217,68,68,0.08)' : 'rgba(20,184,166,0.10)',
                        color:      allOn ? 'var(--red)'           : 'var(--teal)',
                      }}
                    >
                      {allOn ? 'All off' : 'All on'}
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                    {group.flags.map(f => (
                      <label key={f.key} className="flex items-center gap-2 cursor-pointer text-xs py-1">
                        <input
                          type="checkbox"
                          checked={!!flags[f.key]}
                          onChange={() => toggleFlag(f.key)}
                          className="w-3.5 h-3.5 accent-purple-600"
                        />
                        <span style={{ color: flags[f.key] ? 'var(--ink)' : 'var(--ink-soft)' }}>
                          {f.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── 3. Billing (only if paid modules are on) ──────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>Monthly retainer</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                We&rsquo;ll create the Stripe customer and subscription with this monthly amount. Leave blank to skip billing for now &mdash; you can add it later.
              </p>
            </div>
            <div className="form-group">
              <label className="label">Monthly fee (£)</label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
                  style={{ color: 'var(--ink-faint)' }}
                >£</span>
                <input
                  type="number" min="0" step="0.01"
                  className="input"
                  style={{ paddingLeft: 24 }}
                  value={retainerPounds}
                  onChange={e => setRetainerPounds(e.target.value)}
                  placeholder="2500.00"
                />
              </div>
            </div>
            <div className="rounded-[10px] p-3 text-[12px]" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>
              The client will receive a separate email from Stripe to add their payment method on first login.
            </div>
          </div>
        )}

        {/* ── 4. Account owner ──────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>Account manager</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>The TPS team member who looks after this client. Optional &mdash; you can assign later.</p>
            </div>
            {staff.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--ink-faint)' }}>No TPS staff found. Skip and assign later.</p>
            ) : (
              <div className="space-y-2">
                <label
                  className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    border: `1px solid ${ownerId === '' ? 'var(--purple)' : 'var(--line)'}`,
                    background: ownerId === '' ? 'rgba(124,58,237,0.04)' : 'transparent',
                  }}
                >
                  <input type="radio" name="owner" value="" checked={ownerId === ''} onChange={() => setOwnerId('')} className="w-4 h-4" />
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Unassigned</p>
                </label>
                {staff.map(s => (
                  <label
                    key={s.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors"
                    style={{
                      border: `1px solid ${ownerId === s.id ? 'var(--purple)' : 'var(--line)'}`,
                      background: ownerId === s.id ? 'rgba(124,58,237,0.04)' : 'transparent',
                    }}
                  >
                    <input type="radio" name="owner" value={s.id} checked={ownerId === s.id} onChange={() => setOwnerId(s.id)} className="w-4 h-4" />
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}
                    >
                      {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{s.full_name || 'Unnamed'}</p>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 5. Review & invite ────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>Review &amp; create</h3>
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Quick check before we set everything up.</p>
            </div>

            <div className="rounded-[10px] divide-y" style={{ border: '1px solid var(--line)', borderColor: 'var(--line)' }}>
              <ReviewRow label="Company"        value={company.name} />
              <ReviewRow label="Sector / size"  value={[company.sector, company.size_band].filter(Boolean).join(' · ') || '—'} />
              <ReviewRow label="Contact"        value={company.contact_email || '— (no invite will be sent)'} />
              <ReviewRow label="Modules"        value={`${enabledFlags.length} enabled`} />
              <ReviewRow
                label="Tier"
                value={paidEnabled ? `Paid${retainerPounds ? ` · £${parseFloat(retainerPounds).toFixed(2)}/mo` : ' · no retainer set'}` : 'Free'}
              />
              <ReviewRow
                label="Account manager"
                value={staff.find(s => s.id === ownerId)?.full_name || 'Unassigned'}
              />
            </div>

            {company.contact_email && (
              <label
                className="flex items-center gap-3 rounded-[10px] px-4 py-3 cursor-pointer"
                style={{
                  background: sendInvite ? 'rgba(124,58,237,0.06)' : 'var(--surface-soft)',
                  border:     `1px solid ${sendInvite ? 'rgba(124,58,237,0.20)' : 'var(--line)'}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={e => setSendInvite(e.target.checked)}
                  className="w-4 h-4 accent-purple-600"
                />
                <Mail size={14} style={{ color: sendInvite ? 'var(--purple)' : 'var(--ink-faint)' }} />
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Send portal invite</p>
                  <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                    Email {company.contact_email} a magic link &mdash; they&rsquo;ll set their own password on first sign-in.
                  </p>
                </div>
                {sendInvite && <CheckCircle2 size={14} className="ml-auto" style={{ color: 'var(--purple)' }} />}
              </label>
            )}

            {error      && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)',  color: 'var(--red)' }}>{error}</p>}
            {stripeNote && (
              <p className="text-xs p-3 rounded-[8px] flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--amber)' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                {stripeNote}
              </p>
            )}
            {inviteNote && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--amber)' }}>{inviteNote}</p>}
            {manatalNote && (
              <p className="text-xs p-3 rounded-[8px] flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--amber)' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                {manatalNote}
              </p>
            )}
          </div>
        )}

        {/* ── 6. Complete ───────────────────────────────────── */}
        {step === 6 && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(20,184,166,0.12)' }}>
              <CheckCircle2 size={28} style={{ color: 'var(--teal)' }} />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>Client created</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--ink-soft)' }}>
              <strong>{company.name}</strong> is set up.
            </p>
            <p className="text-xs mb-6" style={{ color: 'var(--ink-faint)' }}>
              {sendInvite && company.contact_email
                ? `Invite sent to ${company.contact_email}. They'll set their own password on first sign-in.`
                : 'You can invite the contact from the client profile when ready.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => router.push(`/clients/${createdCompanyId}`)} className="btn-cta btn-sm">
                View client profile
              </button>
              <button
                onClick={() => {
                  setStep(1);
                  setCreatedCompanyId(null);
                  setCompany({ name: '', slug: '', sector: '', size_band: '', contact_email: '' });
                  setFlags(initialFlags());
                  setRetainerPounds('');
                  setOwnerId('');
                  setSendInvite(true);
                }}
                className="btn-secondary btn-sm"
              >
                Onboard another
              </button>
            </div>
          </div>
        )}

        {/* Errors that need to render outside step 5 */}
        {step !== 5 && error && (
          <p className="text-xs p-3 mt-4 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>{error}</p>
        )}

        {/* Navigation */}
        {step < 6 && (
          <div className="flex items-center justify-between mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
            {step > 1 ? (
              <button onClick={handleBack} className="btn-ghost btn-sm" disabled={submitting}>
                <ArrowLeft size={13} /> Back
              </button>
            ) : <div />}
            <button
              onClick={handleNext}
              disabled={submitting}
              className="btn-cta btn-sm"
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              {step === 5
                ? (submitting ? 'Creating…' : 'Create client')
                : 'Next'}
              {step < 5 && !submitting && <ArrowRight size={13} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>{label}</span>
      <span className="text-[13px] font-medium text-right" style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}
