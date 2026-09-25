'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { HS_REGISTER_CATEGORIES, HS_REGISTER_CATEGORY_LABELS } from '@/lib/hs/vocab';
import type { HsAuditTemplate, HsAuditTemplateItem } from '@/lib/hs/types';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

interface Props {
  templates: HsAuditTemplate[];
  items: HsAuditTemplateItem[];
  loadError: string | null;
}

export default function AuditTemplatesClient({ templates, items, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const [itemFormFor, setItemFormFor] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [guidance, setGuidance] = useState('');
  const [category, setCategory] = useState('');

  async function addTemplate() {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await createClient().from('hs_audit_templates').insert({ name: name.trim(), description: description.trim() || null });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setName(''); setDescription(''); setNewTemplateOpen(false);
    toast('Template added', 'success');
    router.refresh();
  }

  async function addItem(templateId: string) {
    if (!prompt.trim()) return;
    setBusy(true);
    const sortOrder = items.filter(i => i.template_id === templateId).length;
    const { error } = await createClient().from('hs_audit_template_items').insert({
      template_id: templateId, prompt: prompt.trim(), guidance: guidance.trim() || null, category: category || null, sort_order: sortOrder,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setPrompt(''); setGuidance(''); setCategory(''); setItemFormFor(null);
    toast('Question added', 'success');
    router.refresh();
  }

  async function toggleActive(t: HsAuditTemplate) {
    const { error, count } = await createClient().from('hs_audit_templates').update({ active: !t.active }, COUNT_EXACT).eq('id', t.id);
    const outcome = judgeWrite({ error, count }, 'The template');
    if (!outcome.ok) { toast(outcome.message ?? 'Could not save.', 'error'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>Templates could not be loaded: {loadError}</p>}

      <div className="flex justify-end">
        <button onClick={() => setNewTemplateOpen(v => !v)} className="btn-cta btn-sm flex items-center gap-1.5">
          <Plus size={13} /> New template
        </button>
      </div>

      {newTemplateOpen && (
        <div className="card p-4 space-y-3">
          <input className="input" placeholder="Template name" value={name} onChange={e => setName(e.target.value)} />
          <textarea className="input h-16 resize-none" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setNewTemplateOpen(false)} className="btn-secondary btn-sm" disabled={busy}>Cancel</button>
            <button onClick={addTemplate} className="btn-cta btn-sm" disabled={busy || !name.trim()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : null} Save
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="card empty-state p-10">
          <ClipboardList size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No audit templates yet.</p>
        </div>
      ) : (
        templates.map(t => {
          const tItems = items.filter(i => i.template_id === t.id).sort((a, b) => a.sort_order - b.sort_order);
          return (
            <details key={t.id} className="card p-4" open={false}>
              <summary className="cursor-pointer font-display font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <ClipboardList size={15} style={{ color: 'var(--purple)' }} />
                {t.name}
                {!t.active && <span className="badge badge-inactive">Inactive</span>}
                <span className="text-xs font-normal ml-auto" style={{ color: 'var(--ink-faint)' }}>{tItems.length} questions</span>
              </summary>
              {t.description && <p className="text-sm mt-2" style={{ color: 'var(--ink-soft)' }}>{t.description}</p>}
              <ul className="mt-3 divide-y" style={{ borderColor: 'var(--line)' }}>
                {tItems.map(i => (
                  <li key={i.id} className="py-2 text-sm">
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>{i.prompt}</span>
                    {i.category && (
                      <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
                        {HS_REGISTER_CATEGORY_LABELS[i.category as keyof typeof HS_REGISTER_CATEGORY_LABELS] ?? i.category}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => setItemFormFor(v => v === t.id ? null : t.id)} className="btn-secondary btn-sm flex items-center gap-1.5">
                  <Plus size={13} /> Add question
                </button>
                <button onClick={() => toggleActive(t)} className="btn-ghost btn-sm">{t.active ? 'Deactivate' : 'Reactivate'}</button>
              </div>
              {itemFormFor === t.id && (
                <div className="mt-3 p-3 rounded-[8px] space-y-2" style={{ border: '1px solid var(--line)' }}>
                  <input className="input" placeholder="Question" value={prompt} onChange={e => setPrompt(e.target.value)} />
                  <input className="input" placeholder="Guidance (optional)" value={guidance} onChange={e => setGuidance(e.target.value)} />
                  <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="">No category</option>
                    {HS_REGISTER_CATEGORIES.map(c => <option key={c} value={c}>{HS_REGISTER_CATEGORY_LABELS[c]}</option>)}
                  </select>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setItemFormFor(null)} className="btn-secondary btn-sm" disabled={busy}>Cancel</button>
                    <button onClick={() => addItem(t.id)} className="btn-cta btn-sm" disabled={busy || !prompt.trim()}>
                      {busy ? <Loader2 size={13} className="animate-spin" /> : null} Add
                    </button>
                  </div>
                </div>
              )}
            </details>
          );
        })
      )}
    </div>
  );
}
