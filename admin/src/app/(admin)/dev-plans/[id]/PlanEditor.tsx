'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, FileText, Sparkles, Globe, Github, Trash } from 'lucide-react';

type PlanStatus = 'draft' | 'active' | 'completed' | 'archived';
type MilestoneStatus = 'pending' | 'in_progress' | 'done';

interface Plan {
  id: string;
  company_id: string;
  athlete_id: string | null;
  title: string;
  summary: string | null;
  status: PlanStatus;
  brand_profile_id: string | null;
  assigned_at: string | null;
}

interface Milestone {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
}

interface BrandProfile {
  id: string;
  company_id: string | null;
  name: string;
  source_url: string | null;
  github_css_url: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  milestones: Array<{ title: string; description?: string | null; due_offset_days?: number | null; sort_order?: number }>;
}

interface Props {
  plan: Plan | null;
  milestones: Milestone[];
  brandProfile: BrandProfile | null;
  companies: Array<{ id: string; name: string }>;
  athletes: Array<{ id: string; full_name: string; company_id: string }>;
  templates: Template[];
  initialCompanyId: string | null;
  initialAthleteId: string | null;
  prefillFromTemplate: Template | null;
}

// Local milestone state — `id` is empty string for unsaved rows.
interface DraftMilestone {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
}

function newMilestone(sort: number): DraftMilestone {
  return { id: '', title: '', description: '', due_date: null, status: 'pending', sort_order: sort };
}

function applyTemplate(t: Template): DraftMilestone[] {
  const today = new Date();
  return [...(t.milestones ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m, i) => {
      let due_date: string | null = null;
      if (typeof m.due_offset_days === 'number') {
        const d = new Date(today);
        d.setDate(d.getDate() + m.due_offset_days);
        due_date = d.toISOString().slice(0, 10);
      }
      return {
        id: '',
        title: m.title,
        description: m.description ?? '',
        due_date,
        status: 'pending' as const,
        sort_order: m.sort_order ?? i,
      };
    });
}

export default function PlanEditor(props: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const initialMilestones: DraftMilestone[] = useMemo(() => {
    if (props.milestones.length > 0) {
      return props.milestones.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description ?? '',
        due_date: m.due_date,
        status: m.status,
        sort_order: m.sort_order,
      }));
    }
    if (props.prefillFromTemplate) return applyTemplate(props.prefillFromTemplate);
    return [];
  }, [props.milestones, props.prefillFromTemplate]);

  const [title, setTitle] = useState(props.plan?.title ?? props.prefillFromTemplate?.name ?? '');
  const [summary, setSummary] = useState(props.plan?.summary ?? props.prefillFromTemplate?.description ?? '');
  const [status, setStatus] = useState<PlanStatus>(props.plan?.status ?? 'draft');
  const [companyId, setCompanyId] = useState(props.plan?.company_id ?? props.initialCompanyId ?? '');
  const [athleteId, setAthleteId] = useState(props.plan?.athlete_id ?? props.initialAthleteId ?? '');
  const [milestones, setMilestones] = useState<DraftMilestone[]>(initialMilestones);

  const [brand, setBrand] = useState<BrandProfile | null>(props.brandProfile);
  const [brandUrl, setBrandUrl] = useState(brand?.source_url ?? '');
  const [brandGithubUrl, setBrandGithubUrl] = useState(brand?.github_css_url ?? '');
  const [extracting, setExtracting] = useState(false);

  const filteredAthletes = companyId
    ? props.athletes.filter(a => a.company_id === companyId)
    : props.athletes;

  function setMilestone(idx: number, patch: Partial<DraftMilestone>) {
    setMilestones(arr => arr.map((m, i) => i === idx ? { ...m, ...patch } : m));
  }
  function moveMilestone(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= milestones.length) return;
    const next = [...milestones];
    [next[idx], next[j]] = [next[j], next[idx]];
    setMilestones(next.map((m, i) => ({ ...m, sort_order: i })));
  }
  function removeMilestone(idx: number) {
    setMilestones(arr => arr.filter((_, i) => i !== idx).map((m, i) => ({ ...m, sort_order: i })));
  }
  function addMilestone() {
    setMilestones(arr => [...arr, newMilestone(arr.length)]);
  }
  function loadTemplate(id: string) {
    const t = props.templates.find(t => t.id === id);
    if (!t) return;
    setMilestones(applyTemplate(t));
    if (!title) setTitle(t.name);
    if (!summary) setSummary(t.description ?? '');
  }

  async function extractBrand() {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch('/api/brand-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: brandUrl || undefined, github_css_url: brandGithubUrl || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Extraction failed');
      const b = json.brand as Partial<BrandProfile>;
      setBrand(prev => ({
        id: prev?.id ?? '',
        company_id: prev?.company_id ?? companyId ?? null,
        name: b.name ?? prev?.name ?? '',
        source_url: brandUrl || null,
        github_css_url: brandGithubUrl || null,
        logo_url: b.logo_url ?? null,
        primary_color: b.primary_color ?? null,
        secondary_color: b.secondary_color ?? null,
        accent_color: b.accent_color ?? null,
        font_family: b.font_family ?? null,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }

  async function save() {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!companyId) { setError('Select a client company'); return; }
    setSaving(true);
    setError(null);
    try {
      // Upsert brand profile if any field is filled.
      let brandId: string | null = brand?.id || null;
      const brandHasContent = brand && (brand.logo_url || brand.primary_color || brand.source_url || brand.github_css_url || brand.font_family);
      if (brandHasContent) {
        const payload = {
          company_id: companyId || null,
          name: brand!.name || title,
          source_url: brand!.source_url,
          github_css_url: brand!.github_css_url,
          logo_url: brand!.logo_url,
          primary_color: brand!.primary_color,
          secondary_color: brand!.secondary_color,
          accent_color: brand!.accent_color,
          font_family: brand!.font_family,
        };
        if (brandId) {
          const { error: e } = await supabase.from('brand_profiles').update(payload).eq('id', brandId);
          if (e) throw e;
        } else {
          const { data, error: e } = await supabase.from('brand_profiles').insert(payload).select('id').single();
          if (e) throw e;
          brandId = data!.id;
        }
      }

      // Upsert plan.
      let planId = props.plan?.id ?? null;
      const planPayload = {
        company_id: companyId,
        athlete_id: athleteId || null,
        title: title.trim(),
        summary: summary.trim() || null,
        status,
        brand_profile_id: brandId,
        assigned_at: status === 'active' && !props.plan?.assigned_at ? new Date().toISOString() : props.plan?.assigned_at ?? null,
      };
      if (planId) {
        const { error: e } = await supabase.from('dev_plans').update(planPayload).eq('id', planId);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from('dev_plans').insert(planPayload).select('id').single();
        if (e) throw e;
        planId = data!.id;
      }

      // Replace milestones (simpler than diffing).
      const { error: dErr } = await supabase.from('dev_plan_milestones').delete().eq('plan_id', planId);
      if (dErr) throw dErr;
      if (milestones.length > 0) {
        const rows = milestones
          .filter(m => m.title.trim())
          .map((m, i) => ({
            plan_id: planId,
            title: m.title.trim(),
            description: (m.description ?? '').trim() || null,
            due_date: m.due_date || null,
            status: m.status,
            sort_order: i,
          }));
        if (rows.length > 0) {
          const { error: iErr } = await supabase.from('dev_plan_milestones').insert(rows);
          if (iErr) throw iErr;
        }
      }

      startTransition(() => {
        router.push(`/dev-plans/${planId}`);
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveAsTemplate() {
    const name = window.prompt('Template name?', title);
    if (!name) return;
    const tplMilestones = milestones
      .filter(m => m.title.trim())
      .map((m, i) => ({ title: m.title, description: m.description, sort_order: i }));
    const { error: e } = await supabase.from('dev_plan_templates').insert({
      name, description: summary || null, milestones: tplMilestones,
    });
    if (e) setError(e.message); else alert('Template saved.');
  }

  async function deletePlan() {
    if (!props.plan) return;
    if (!confirm('Delete this plan? This cannot be undone.')) return;
    const { error: e } = await supabase.from('dev_plans').delete().eq('id', props.plan.id);
    if (e) { setError(e.message); return; }
    router.push('/dev-plans');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="card p-3" style={{ borderColor: 'var(--red)', background: 'rgba(217,68,68,0.05)' }}>
          <p style={{ color: 'var(--red)' }} className="text-sm font-semibold">{error}</p>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Transition to Operations Lead" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={e => setStatus(e.target.value as PlanStatus)}>
              <option value="draft">Draft</option>
              <option value="active">Active (visible to client)</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="label">Client company *</label>
            <select className="input" value={companyId} onChange={e => { setCompanyId(e.target.value); setAthleteId(''); }}>
              <option value="">Select…</option>
              {props.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Athlete</label>
            <select className="input" value={athleteId} onChange={e => setAthleteId(e.target.value)} disabled={!companyId}>
              <option value="">— None —</option>
              {filteredAthletes.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Summary</label>
            <textarea className="input" rows={3} value={summary} onChange={e => setSummary(e.target.value)} placeholder="Plan overview, goals, context…" />
          </div>
          {props.templates.length > 0 && !props.plan && (
            <div className="md:col-span-2">
              <label className="label">Load milestones from template</label>
              <select className="input" defaultValue="" onChange={e => { if (e.target.value) loadTemplate(e.target.value); }}>
                <option value="">— Select template —</option>
                {props.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Milestones</h3>
          <button type="button" className="btn-secondary btn-sm" onClick={addMilestone}>
            <Plus size={12} /> Add milestone
          </button>
        </div>
        {milestones.length === 0 ? (
          <div className="empty-state">No milestones yet. Add one or load a template.</div>
        ) : (
          <div className="space-y-3">
            {milestones.map((m, idx) => (
              <div key={idx} className="border rounded-md p-3 space-y-2" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1 pt-1">
                    <button type="button" className="btn-icon btn-sm" onClick={() => moveMilestone(idx, -1)} disabled={idx === 0}><ArrowUp size={12} /></button>
                    <button type="button" className="btn-icon btn-sm" onClick={() => moveMilestone(idx, 1)} disabled={idx === milestones.length - 1}><ArrowDown size={12} /></button>
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input className="input md:col-span-2" placeholder="Milestone title" value={m.title} onChange={e => setMilestone(idx, { title: e.target.value })} />
                    <select className="input" value={m.status} onChange={e => setMilestone(idx, { status: e.target.value as MilestoneStatus })}>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Done</option>
                    </select>
                    <textarea className="input md:col-span-2" rows={2} placeholder="Description (optional)" value={m.description ?? ''} onChange={e => setMilestone(idx, { description: e.target.value })} />
                    <input className="input" type="date" value={m.due_date ?? ''} onChange={e => setMilestone(idx, { due_date: e.target.value || null })} />
                  </div>
                  <button type="button" className="btn-icon btn-sm" onClick={() => removeMilestone(idx)} title="Remove"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Brand profile</h3>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Optional — extract logo & colours from the client&apos;s website to style this plan.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label"><Globe size={11} className="inline mr-1" /> Website URL</label>
            <input className="input" placeholder="https://client.example.com" value={brandUrl} onChange={e => setBrandUrl(e.target.value)} />
          </div>
          <div>
            <label className="label"><Github size={11} className="inline mr-1" /> GitHub CSS URL (optional)</label>
            <input className="input" placeholder="https://github.com/owner/repo/blob/main/styles.css" value={brandGithubUrl} onChange={e => setBrandGithubUrl(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={extractBrand} disabled={extracting || (!brandUrl && !brandGithubUrl)}>
          <Sparkles size={12} /> {extracting ? 'Extracting…' : 'Extract brand'}
        </button>

        {brand && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <div>
              <label className="label">Brand name</label>
              <input className="input" value={brand.name ?? ''} onChange={e => setBrand({ ...brand, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Logo URL</label>
              <input className="input" value={brand.logo_url ?? ''} onChange={e => setBrand({ ...brand, logo_url: e.target.value || null })} />
            </div>
            <div>
              <label className="label">Font family</label>
              <input className="input" value={brand.font_family ?? ''} onChange={e => setBrand({ ...brand, font_family: e.target.value || null })} />
            </div>
            {(['primary_color', 'secondary_color', 'accent_color'] as const).map(k => (
              <div key={k}>
                <label className="label">{k.replace('_', ' ')}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={brand[k] ?? '#7c3aed'} onChange={e => setBrand({ ...brand, [k]: e.target.value })} className="w-10 h-10 rounded-md border cursor-pointer" style={{ borderColor: 'var(--line)' }} />
                  <input className="input flex-1" value={brand[k] ?? ''} onChange={e => setBrand({ ...brand, [k]: e.target.value || null })} placeholder="#7c3aed" />
                </div>
              </div>
            ))}
            {brand.logo_url && (
              <div className="md:col-span-3 flex items-center gap-3 p-3 rounded-md" style={{ background: 'var(--surface-soft)' }}>
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Preview:</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.logo_url} alt="logo" className="h-10 w-auto" />
                {(['primary_color', 'secondary_color', 'accent_color'] as const).map(k => brand[k] && (
                  <div key={k} className="w-8 h-8 rounded-md border" style={{ background: brand[k] ?? '', borderColor: 'var(--line)' }} title={brand[k] ?? ''} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-cta" onClick={save} disabled={saving || pending}>
          <Save size={14} /> {saving ? 'Saving…' : (props.plan ? 'Save plan' : 'Create plan')}
        </button>
        <button type="button" className="btn-secondary" onClick={saveAsTemplate} disabled={milestones.length === 0}>
          <FileText size={14} /> Save as template
        </button>
        {props.plan && (
          <button type="button" className="btn-ghost" onClick={deletePlan} style={{ color: 'var(--red)' }}>
            <Trash size={14} /> Delete plan
          </button>
        )}
      </div>
    </div>
  );
}
