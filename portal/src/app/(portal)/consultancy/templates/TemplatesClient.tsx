'use client';

// Core-OS 360 Phase 7, Group 2. Direct client-side writes under RLS —
// consultancy_visit_templates_consultancy_write/consultancy_visit_
// template_items_consultancy_all (173) are the real authorization
// boundary, the same "session insert under RLS" pattern admin's
// DocumentsClient.tsx/EquipmentClient.tsx already use for staff-side
// register writes. router.refresh() re-runs the server component's
// data fetch after a successful write, rather than this component
// managing its own duplicate list state.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { VISIT_TEMPLATE_CATEGORIES, VISIT_TEMPLATE_CATEGORY_LABELS } from '@/lib/consultancy/vocab';
import type { ConsultancyVisitTemplate, ConsultancyVisitTemplateItem } from '@/lib/consultancy/types';

interface Props {
  templates: ConsultancyVisitTemplate[];
  items: ConsultancyVisitTemplateItem[];
}

export default function TemplatesClient({ templates, items }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  const itemsByTemplate = new Map<string, ConsultancyVisitTemplateItem[]>();
  for (const i of items) {
    if (!itemsByTemplate.has(i.template_id)) itemsByTemplate.set(i.template_id, []);
    itemsByTemplate.get(i.template_id)!.push(i);
  }

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Visit Templates</h1>
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{templates.filter(t => t.is_active).length} active</p>
        </div>
        <button className="btn-cta btn-sm" onClick={() => setShowNewTemplate(v => !v)}>
          <Plus size={13} /> New template
        </button>
      </div>

      {showNewTemplate && <NewTemplateForm onSaved={() => { setShowNewTemplate(false); router.refresh(); }} />}

      {templates.length === 0 ? (
        <div className="card p-12"><div className="empty-state"><p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No templates yet.</p></div></div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="card p-4">
              <button className="flex items-center gap-2 w-full text-left" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                {expanded === t.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <strong style={{ color: 'var(--ink)' }}>{t.name}</strong>
                <span className="badge">{VISIT_TEMPLATE_CATEGORY_LABELS[t.category]}</span>
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>v{t.version}{!t.is_active ? ' (superseded)' : ''}</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--ink-faint)' }}>{(itemsByTemplate.get(t.id) ?? []).length} items</span>
              </button>
              {expanded === t.id && (
                <div className="pt-3 mt-3 space-y-3" style={{ borderTop: '1px solid var(--line)' }}>
                  {(itemsByTemplate.get(t.id) ?? []).length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No items yet.</p>
                  ) : (
                    <ul className="text-sm space-y-1" style={{ color: 'var(--ink-soft)' }}>
                      {(itemsByTemplate.get(t.id) ?? []).map(i => (
                        <li key={i.id}>
                          <span className="text-xs font-semibold" style={{ color: 'var(--ink-faint)' }}>{i.section}</span>
                          {' — '}{i.question}{i.expects_evidence ? ' (evidence expected)' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {t.is_active && <AddItemForm templateId={t.id} nextSortOrder={(itemsByTemplate.get(t.id) ?? []).length} onSaved={() => router.refresh()} />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function NewTemplateForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(VISIT_TEMPLATE_CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const supabase = createClient();
    const { data: homeId, error: homeErr } = await supabase.rpc('my_home_company_id');
    if (homeErr || !homeId) { setError('Could not resolve your organisation'); setSaving(false); return; }
    const { error: insertErr } = await supabase.from('consultancy_visit_templates')
      .insert({ consultancy_organisation_id: homeId, name, category });
    if (insertErr) { setError(insertErr.message); setSaving(false); return; }
    onSaved();
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <input className="input" placeholder="Template name" value={name} onChange={e => setName(e.target.value)} required />
        <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
          {VISIT_TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{VISIT_TEMPLATE_CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
      <button type="submit" disabled={saving} className="btn-cta btn-sm">
        {saving && <Loader2 size={13} className="animate-spin" />} {saving ? 'Saving…' : 'Save template'}
      </button>
    </form>
  );
}

function AddItemForm({ templateId, nextSortOrder, onSaved }: { templateId: string; nextSortOrder: number; onSaved: () => void }) {
  const [section, setSection] = useState('');
  const [question, setQuestion] = useState('');
  const [expectsEvidence, setExpectsEvidence] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const supabase = createClient();
    const { error: insertErr } = await supabase.from('consultancy_visit_template_items').insert({
      template_id: templateId, section, question, expects_evidence: expectsEvidence, sort_order: nextSortOrder,
    });
    if (insertErr) { setError(insertErr.message); setSaving(false); return; }
    setSection(''); setQuestion(''); setExpectsEvidence(false);
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <input className="input" style={{ maxWidth: 160 }} placeholder="Section" value={section} onChange={e => setSection(e.target.value)} required />
      <input className="input flex-1" style={{ minWidth: 200 }} placeholder="Question" value={question} onChange={e => setQuestion(e.target.value)} required />
      <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
        <input type="checkbox" checked={expectsEvidence} onChange={e => setExpectsEvidence(e.target.checked)} /> Evidence expected
      </label>
      <button type="submit" disabled={saving} className="btn-secondary btn-sm">
        {saving && <Loader2 size={13} className="animate-spin" />} Add item
      </button>
      {error && <p className="text-xs w-full" style={{ color: 'var(--red)' }}>{error}</p>}
    </form>
  );
}
