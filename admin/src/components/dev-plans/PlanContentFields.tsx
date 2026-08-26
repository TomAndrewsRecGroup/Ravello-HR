'use client';

import TiptapEditor from '@/components/modules/TiptapEditor';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { DevPlanContent, DevPlanStrength, CareerFit } from '@/lib/devPlan';

// ═══════════════════════════════════════════════════════════
// Dev-plan report content editor — shared by the full editor
// (PlanEditor) and the guided wizard (DevPlanWizard). Exposes the
// report as an ordered list of section descriptors so both surfaces
// render the same fields; the wizard shows one per step, the editor
// stacks them all.
// ═══════════════════════════════════════════════════════════

export interface FieldsCtx {
  content: DevPlanContent;
  update: (fn: (c: DevPlanContent) => DevPlanContent) => void;
  strengths: DevPlanStrength[];
  setStrengths: (s: DevPlanStrength[]) => void;
}

export interface SectionDef {
  key: string;
  label: string;
  hint?: string;
  render: (ctx: FieldsCtx) => JSX.Element;
}

// ── primitives ───────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      {hint && <p className="text-[11px] mb-1.5" style={{ color: 'var(--ink-faint)' }}>{hint}</p>}
      {children}
    </div>
  );
}

function RichField({ label, hint, value, onChange, placeholder, minHeight = 140 }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <TiptapEditor value={value} onChange={onChange} placeholder={placeholder} minHeight={minHeight} />
    </Field>
  );
}

// Simple string[] editor (bullets, company items).
function StringListEditor({ items, onChange, placeholder, addLabel = 'Add item' }: {
  items: string[]; onChange: (next: string[]) => void; placeholder?: string; addLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className="input flex-1" value={v} placeholder={placeholder}
            onChange={e => onChange(items.map((x, j) => j === i ? e.target.value : x))} />
          <button type="button" className="btn-icon btn-sm" aria-label="Remove"
            onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
        </div>
      ))}
      <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...items, ''])}>
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}

// Generic ordered card list with add / remove / reorder.
function CardList<T>({ items, onChange, makeEmpty, render, addLabel }: {
  items: T[]; onChange: (next: T[]) => void; makeEmpty: () => T;
  render: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode; addLabel: string;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border rounded-md p-3" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-start gap-2">
            <div className="flex flex-col gap-1 pt-1">
              <button type="button" className="btn-icon btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={12} /></button>
              <button type="button" className="btn-icon btn-sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={12} /></button>
            </div>
            <div className="flex-1">
              {render(item, (p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x)))}
            </div>
            <button type="button" className="btn-icon btn-sm" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...items, makeEmpty()])}>
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}

// ── section descriptors ──────────────────────────────────────
export const DEV_PLAN_SECTIONS: SectionDef[] = [
  {
    key: 'cover',
    label: 'Cover',
    hint: 'The front page: name comes from the athlete; add the framing and details here.',
    render: ({ content, update }) => {
      const cov = content.cover ?? {};
      const set = (p: Partial<NonNullable<DevPlanContent['cover']>>) => update(c => ({ ...c, cover: { ...c.cover, ...p } }));
      return (
        <div>
          <Field label="Report type (eyebrow)" hint="Shown above the title on the cover.">
            <input className="input" value={cov.report_kind ?? ''} placeholder="Athlete Transition Report" onChange={e => set({ report_kind: e.target.value })} />
          </Field>
          <Field label="Positioning line" hint="One-line summary under the name on the cover.">
            <textarea className="input" rows={2} value={cov.tagline ?? ''} placeholder="An experienced commercial relationship builder…" onChange={e => set({ tagline: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Date"><input className="input" value={cov.date_label ?? ''} placeholder="July 2026" onChange={e => set({ date_label: e.target.value })} /></Field>
            <Field label="Location"><input className="input" value={cov.location ?? ''} placeholder="United Kingdom" onChange={e => set({ location: e.target.value })} /></Field>
            <Field label="Prepared by"><input className="input" value={cov.prepared_by ?? ''} placeholder="The People System" onChange={e => set({ prepared_by: e.target.value })} /></Field>
          </div>
        </div>
      );
    },
  },
  {
    key: 'exec_summary',
    label: 'Executive Summary',
    render: ({ content, update }) => {
      const es = content.exec_summary ?? {};
      const set = (p: Partial<NonNullable<DevPlanContent['exec_summary']>>) => update(c => ({ ...c, exec_summary: { ...c.exec_summary, ...p } }));
      return (
        <div>
          <Field label="Heading" hint="Optional bold heading for the section."><input className="input" value={es.heading ?? ''} placeholder="An experienced commercial professional" onChange={e => set({ heading: e.target.value })} /></Field>
          <RichField label="Summary" value={es.body_html ?? ''} onChange={v => set({ body_html: v })} placeholder="Two or three paragraphs introducing the athlete…" minHeight={180} />
        </div>
      );
    },
  },
  {
    key: 'positioning',
    label: 'Positioning Statement',
    hint: 'The headline framing, shown as a highlighted pull-quote.',
    render: ({ content, update }) => (
      <RichField label="Positioning callout" value={content.positioning ?? ''} onChange={v => update(c => ({ ...c, positioning: v }))}
        placeholder="Rather than positioning X as a former athlete, they should be seen as…" minHeight={120} />
    ),
  },
  {
    key: 'profile',
    label: 'Athlete Profile',
    render: ({ content, update }) => {
      const pr = content.profile ?? {};
      const set = (p: Partial<NonNullable<DevPlanContent['profile']>>) => update(c => ({ ...c, profile: { ...c.profile, ...p } }));
      const facts = pr.facts ?? [];
      return (
        <div>
          <Field label="Key facts" hint="Small fact cards (e.g. Name, Age, Location).">
            <CardList
              items={facts}
              onChange={next => set({ facts: next })}
              makeEmpty={() => ({ k: '', v: '' })}
              addLabel="Add fact"
              render={(f, patch) => (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="input" value={f.k} placeholder="Label (e.g. Age)" onChange={e => patch({ k: e.target.value })} />
                  <input className="input" value={f.v} placeholder="Value (e.g. 38)" onChange={e => patch({ v: e.target.value })} />
                </div>
              )}
            />
          </Field>
          <Field label="Professional career" hint="Bulleted career highlights.">
            <StringListEditor items={pr.career ?? []} onChange={next => set({ career: next })} placeholder="e.g. Multiple Ironman victories" addLabel="Add highlight" />
          </Field>
          <RichField label="Education / notes" value={pr.education_html ?? ''} onChange={v => set({ education_html: v })} placeholder="Degree, academic background, etc." minHeight={100} />
        </div>
      );
    },
  },
  {
    key: 'career_overview',
    label: 'Career Overview',
    render: ({ content, update }) => {
      const co = content.career_overview ?? {};
      const set = (p: Partial<NonNullable<DevPlanContent['career_overview']>>) => update(c => ({ ...c, career_overview: { ...c.career_overview, ...p } }));
      return (
        <div>
          <Field label="Heading"><input className="input" value={co.heading ?? ''} placeholder="A self-employed business owner" onChange={e => set({ heading: e.target.value })} /></Field>
          <RichField label="Overview" value={co.body_html ?? ''} onChange={v => set({ body_html: v })} minHeight={150} />
          <Field label="Bullet points" hint="Optional supporting list.">
            <StringListEditor items={co.bullets ?? []} onChange={next => set({ bullets: next })} placeholder="e.g. Negotiate commercial partnerships" addLabel="Add bullet" />
          </Field>
        </div>
      );
    },
  },
  {
    key: 'findings',
    label: 'Key Findings',
    hint: 'Discovery-call findings as headed sub-sections, plus brand partnerships.',
    render: ({ content, update }) => (
      <div>
        <Field label="Findings">
          <CardList
            items={content.findings ?? []}
            onChange={next => update(c => ({ ...c, findings: next }))}
            makeEmpty={() => ({ heading: '', body_html: '' })}
            addLabel="Add finding"
            render={(f, patch) => (
              <div>
                <input className="input mb-2" value={f.heading} placeholder="Sub-heading (e.g. Commercial experience)" onChange={e => patch({ heading: e.target.value })} />
                <TiptapEditor value={f.body_html} onChange={v => patch({ body_html: v })} minHeight={110} />
              </div>
            )}
          />
        </Field>
        <Field label="Brand partnerships" hint="Shown as chips.">
          <StringListEditor items={content.brand_partnerships ?? []} onChange={next => update(c => ({ ...c, brand_partnerships: next }))} placeholder="e.g. HOKA" addLabel="Add brand" />
        </Field>
      </div>
    ),
  },
  {
    key: 'personality',
    label: 'Personality Assessment',
    hint: 'Trait cards — a label and a short description each.',
    render: ({ content, update }) => (
      <CardList
        items={content.personality ?? []}
        onChange={next => update(c => ({ ...c, personality: next }))}
        makeEmpty={() => ({ label: '', body: '' })}
        addLabel="Add trait"
        render={(t, patch) => (
          <div>
            <input className="input mb-2" value={t.label} placeholder="Trait (e.g. Authentic)" onChange={e => patch({ label: e.target.value })} />
            <textarea className="input" rows={2} value={t.body} placeholder="Short description of the trait…" onChange={e => patch({ body: e.target.value })} />
          </div>
        )}
      />
    ),
  },
  {
    key: 'strengths',
    label: 'Areas of Strength',
    hint: 'Drives the radar chart. Rate each strength 0–5.',
    render: ({ strengths, setStrengths }) => (
      <div>
        <CardList
          items={strengths}
          onChange={setStrengths}
          makeEmpty={() => ({ label: '', rating: 4 })}
          addLabel="Add strength"
          render={(s, patch) => (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
              <input className="input" value={s.label} placeholder="e.g. Business Development" onChange={e => patch({ label: e.target.value })} />
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={5} step={0.5} value={s.rating} onChange={e => patch({ rating: parseFloat(e.target.value) })} style={{ accentColor: '#c9a24a' }} />
                <input type="number" min={0} max={5} step={0.5} className="input" style={{ width: 72 }} value={s.rating} onChange={e => patch({ rating: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          )}
        />
        <p className="text-[11px] mt-2" style={{ color: 'var(--ink-faint)' }}>The radar needs at least 3 strengths to render.</p>
      </div>
    ),
  },
  {
    key: 'career_paths',
    label: 'Potential Career Paths',
    render: ({ content, update }) => (
      <CardList
        items={content.career_paths ?? []}
        onChange={next => update(c => ({ ...c, career_paths: next }))}
        makeEmpty={() => ({ title: '', body: '', fit: 'strong' as CareerFit })}
        addLabel="Add career path"
        render={(p, patch) => (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-2">
              <input className="input" value={p.title} placeholder="Role (e.g. Commercial Partnerships Manager)" onChange={e => patch({ title: e.target.value })} />
              <select className="input" value={p.fit} onChange={e => patch({ fit: e.target.value as CareerFit })}>
                <option value="strongest">Strongest fit</option>
                <option value="strong">Strong</option>
                <option value="emerging">Emerging</option>
              </select>
            </div>
            <textarea className="input" rows={2} value={p.body} placeholder="Why this role fits…" onChange={e => patch({ body: e.target.value })} />
          </div>
        )}
      />
    ),
  },
  {
    key: 'companies',
    label: 'Companies Worth Exploring',
    hint: 'Grouped target companies — a category and its companies (chips).',
    render: ({ content, update }) => (
      <CardList
        items={content.companies ?? []}
        onChange={next => update(c => ({ ...c, companies: next }))}
        makeEmpty={() => ({ category: '', items: [] })}
        addLabel="Add category"
        render={(cat, patch) => (
          <div>
            <input className="input mb-2" value={cat.category} placeholder="Category (e.g. Sports Technology)" onChange={e => patch({ category: e.target.value })} />
            <StringListEditor items={cat.items ?? []} onChange={next => patch({ items: next })} placeholder="Company (e.g. Garmin)" addLabel="Add company" />
          </div>
        )}
      />
    ),
  },
  {
    key: 'opportunity',
    label: 'Opportunity Within A2I',
    render: ({ content, update }) => {
      const op = content.opportunity ?? {};
      const set = (p: Partial<NonNullable<DevPlanContent['opportunity']>>) => update(c => ({ ...c, opportunity: { ...c.opportunity, ...p } }));
      return (
        <div>
          <Field label="Heading"><input className="input" value={op.heading ?? ''} placeholder="Athlete Success & Partnerships" onChange={e => set({ heading: e.target.value })} /></Field>
          <RichField label="Opportunity" value={op.body_html ?? ''} onChange={v => set({ body_html: v })} minHeight={140} />
          <Field label="Bullet points" hint="Optional (e.g. commercial model).">
            <StringListEditor items={op.bullets ?? []} onChange={next => set({ bullets: next })} placeholder="e.g. Referral commission for introducing athletes" addLabel="Add bullet" />
          </Field>
        </div>
      );
    },
  },
  {
    key: 'assessment',
    label: 'Overall Assessment',
    render: ({ content, update }) => (
      <RichField label="Overall assessment" value={content.assessment?.body_html ?? ''} onChange={v => update(c => ({ ...c, assessment: { ...c.assessment, body_html: v } }))} minHeight={140} />
    ),
  },
];

// Full stacked editor (used inside PlanEditor).
export default function PlanContentFields(ctx: FieldsCtx) {
  return (
    <div className="space-y-6">
      {DEV_PLAN_SECTIONS.map(sec => (
        <div key={sec.key} className="card p-5">
          <div className="mb-3">
            <h3 className="font-display text-base font-semibold">{sec.label}</h3>
            {sec.hint && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{sec.hint}</p>}
          </div>
          {sec.render(ctx)}
        </div>
      ))}
    </div>
  );
}
