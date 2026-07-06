'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { X, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { DEV_PLAN_SECTIONS, type FieldsCtx } from './PlanContentFields';
import type { DevPlanContent, DevPlanStrength } from '@/lib/devPlan';

interface Props {
  companies: Array<{ id: string; name: string }>;
  athletes: Array<{ id: string; full_name: string; company_id: string }>;
  onClose: () => void;
}

// Guided, onboarding-style builder for a full transition report.
// Walks setup → each report section → review, then inserts a DRAFT
// dev_plan and drops the admin into the editor to refine.
export default function DevPlanWizard({ companies, athletes, onClose }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0); // 0 = setup, 1..N = sections, N+1 = review
  const [companyId, setCompanyId] = useState('');
  const [athleteId, setAthleteId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<DevPlanContent>({});
  const [strengths, setStrengths] = useState<DevPlanStrength[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectionCount = DEV_PLAN_SECTIONS.length;
  const reviewStep = sectionCount + 1;
  const filteredAthletes = companyId ? athletes.filter(a => a.company_id === companyId) : athletes;

  const ctx: FieldsCtx = useMemo(
    () => ({ content, update: fn => setContent(prev => fn(prev)), strengths, setStrengths }),
    [content, strengths],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function next() {
    setError(null);
    if (step === 0) {
      if (!companyId) { setError('Select a client company.'); return; }
      if (!title.trim()) { setError('Give the plan a title.'); return; }
    }
    setStep(s => Math.min(s + 1, reviewStep));
  }
  function back() { setError(null); setStep(s => Math.max(s - 1, 0)); }

  async function create() {
    if (!companyId || !title.trim()) { setError('Company and title are required.'); setStep(0); return; }
    setSaving(true);
    setError(null);
    try {
      const cleanStrengths = strengths
        .filter(s => s.label.trim())
        .map(s => ({ label: s.label.trim(), rating: Math.min(5, Math.max(0, Number(s.rating) || 0)) }));
      const { data, error: e } = await supabase
        .from('dev_plans')
        .insert({
          company_id: companyId,
          athlete_id: athleteId || null,
          title: title.trim(),
          status: 'draft',
          content,
          strengths: cleanStrengths,
        })
        .select('id')
        .single();
      if (e) throw e;
      router.push(`/dev-plans/${data!.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the plan.');
      setSaving(false);
    }
  }

  const activeSection = step >= 1 && step <= sectionCount ? DEV_PLAN_SECTIONS[step - 1] : null;
  const stepLabel = step === 0 ? 'Setup' : step === reviewStep ? 'Review' : activeSection?.label ?? '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.55)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full flex flex-col"
        style={{ maxWidth: 720, maxHeight: '92vh', background: 'var(--surface)', borderRadius: 16, boxShadow: '0 24px 80px rgba(7,11,29,0.35)' }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div>
            <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>Guided development plan</h2>
            <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              Step {step + 1} of {reviewStep + 1} · {stepLabel}
            </p>
          </div>
          <button type="button" className="btn-icon btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {/* progress bar */}
        <div className="h-1" style={{ background: 'var(--surface-alt)' }}>
          <div className="h-full" style={{ width: `${((step + 1) / (reviewStep + 1)) * 100}%`, background: 'var(--gradient, #7C3AED)', transition: 'width .2s' }} />
        </div>

        {/* body */}
        <div className="px-5 py-5 overflow-y-auto" style={{ flex: 1 }}>
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                Who is this plan for? You can leave every later step blank and fill it in afterwards — nothing is required except the basics here.
              </p>
              <div>
                <label className="label">Client company *</label>
                <select className="input" value={companyId} onChange={e => { setCompanyId(e.target.value); setAthleteId(''); }}>
                  <option value="">Select…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Athlete</label>
                <select
                  className="input"
                  value={athleteId}
                  disabled={!companyId}
                  onChange={e => {
                    setAthleteId(e.target.value);
                    const a = filteredAthletes.find(x => x.id === e.target.value);
                    if (a && !title.trim()) setTitle(`${a.full_name} — Development Plan`);
                  }}
                >
                  <option value="">— None —</option>
                  {filteredAthletes.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Plan title *</label>
                <input className="input" value={title} placeholder="e.g. Joe Skipper — Development Plan" onChange={e => setTitle(e.target.value)} />
              </div>
            </div>
          )}

          {activeSection && (
            <div>
              <div className="mb-3">
                <h3 className="font-display text-base font-semibold" style={{ color: 'var(--ink)' }}>{activeSection.label}</h3>
                {activeSection.hint && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{activeSection.hint}</p>}
              </div>
              {activeSection.render(ctx)}
            </div>
          )}

          {step === reviewStep && (
            <div className="space-y-3">
              <h3 className="font-display text-base font-semibold" style={{ color: 'var(--ink)' }}>Ready to create</h3>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                We&apos;ll create this as a <strong>draft</strong> plan and open the editor so you can refine it and preview the branded document before sharing.
              </p>
              <div className="rounded-[10px] divide-y" style={{ border: '1px solid var(--line)' }}>
                <ReviewRow label="Company" value={companies.find(c => c.id === companyId)?.name ?? '—'} />
                <ReviewRow label="Athlete" value={athletes.find(a => a.id === athleteId)?.full_name ?? '—'} />
                <ReviewRow label="Title" value={title || '—'} />
                <ReviewRow label="Strengths" value={strengths.filter(s => s.label.trim()).length ? `${strengths.filter(s => s.label.trim()).length} rated` : 'None yet'} />
                <ReviewRow label="Career paths" value={`${(content.career_paths ?? []).filter(p => p.title).length}`} />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs p-3 mt-4 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>{error}</p>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
          {step > 0
            ? <button type="button" className="btn-ghost btn-sm" onClick={back} disabled={saving}><ArrowLeft size={13} /> Back</button>
            : <div />}
          {step < reviewStep ? (
            <button type="button" className="btn-cta btn-sm" onClick={next}>
              {step === 0 ? 'Start' : 'Next'} <ArrowRight size={13} />
            </button>
          ) : (
            <button type="button" className="btn-cta btn-sm" onClick={create} disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {saving ? 'Creating…' : 'Create draft plan'}
            </button>
          )}
        </div>
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
