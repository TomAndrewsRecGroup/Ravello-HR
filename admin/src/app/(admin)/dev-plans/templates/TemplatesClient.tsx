'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';

interface TemplateMilestone {
  title: string;
  description?: string | null;
  due_offset_days?: number | null;
  sort_order?: number;
}
interface Template {
  id: string;
  name: string;
  description: string | null;
  milestones: TemplateMilestone[];
  updated_at: string;
}

export default function TemplatesClient({ initial }: { initial: Template[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startNew() {
    const t: Template = { id: '', name: '', description: '', milestones: [{ title: '' }], updated_at: '' };
    setDraft(t);
    setEditing('__new__');
  }
  function startEdit(t: Template) {
    setDraft(JSON.parse(JSON.stringify(t)));
    setEditing(t.id);
  }
  function cancel() { setDraft(null); setEditing(null); setError(null); }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setError('Name required'); return; }
    const payload = {
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      milestones: draft.milestones
        .filter(m => m.title.trim())
        .map((m, i) => ({ ...m, sort_order: i })),
    };
    if (editing === '__new__') {
      const { data, error: e } = await supabase.from('dev_plan_templates').insert(payload).select('*').single();
      if (e) { setError(e.message); return; }
      setItems(arr => [...arr, data as Template].sort((a, b) => a.name.localeCompare(b.name)));
    } else {
      const { data, error: e } = await supabase.from('dev_plan_templates').update(payload).eq('id', draft.id).select('*').single();
      if (e) { setError(e.message); return; }
      setItems(arr => arr.map(t => t.id === draft.id ? (data as Template) : t));
    }
    cancel();
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    const { error: e } = await supabase.from('dev_plan_templates').delete().eq('id', id);
    if (e) { setError(e.message); return; }
    setItems(arr => arr.filter(t => t.id !== id));
  }

  function setMilestone(idx: number, patch: Partial<TemplateMilestone>) {
    if (!draft) return;
    setDraft({ ...draft, milestones: draft.milestones.map((m, i) => i === idx ? { ...m, ...patch } : m) });
  }
  function addMilestone() {
    if (!draft) return;
    setDraft({ ...draft, milestones: [...draft.milestones, { title: '' }] });
  }
  function removeMilestone(idx: number) {
    if (!draft) return;
    setDraft({ ...draft, milestones: draft.milestones.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-4">
      {error && <div className="card p-3" style={{ borderColor: 'var(--red)' }}><p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p></div>}

      {!editing && (
        <button className="btn-cta" onClick={startNew}><Plus size={14} /> New template</button>
      )}

      {editing && draft && (
        <div className="card p-5 space-y-3">
          <input className="input" placeholder="Template name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <textarea className="input" rows={2} placeholder="Description" value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>Milestones</p>
            {draft.milestones.map((m, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-start">
                <input className="input md:col-span-3" placeholder="Title" value={m.title} onChange={e => setMilestone(i, { title: e.target.value })} />
                <input className="input md:col-span-2" placeholder="Description" value={m.description ?? ''} onChange={e => setMilestone(i, { description: e.target.value })} />
                <div className="flex items-center gap-2">
                  <input className="input" type="number" placeholder="Days" value={m.due_offset_days ?? ''} onChange={e => setMilestone(i, { due_offset_days: e.target.value ? Number(e.target.value) : null })} title="Due in N days from plan start" />
                  <button className="btn-icon btn-sm" onClick={() => removeMilestone(i)}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
            <button className="btn-secondary btn-sm" onClick={addMilestone}><Plus size={12} /> Add milestone</button>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-cta btn-sm" onClick={save}><Check size={12} /> Save</button>
            <button className="btn-ghost btn-sm" onClick={cancel}><X size={12} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="card p-0">
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Name</th><th>Description</th><th>Milestones</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">No templates yet.</td></tr>
              ) : items.map(t => (
                <tr key={t.id}>
                  <td className="font-semibold">{t.name}</td>
                  <td>{t.description ?? <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                  <td>{t.milestones?.length ?? 0}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/dev-plans/new?template=${t.id}`} className="btn-secondary btn-sm">Use</Link>{' '}
                    <button className="btn-ghost btn-sm" onClick={() => startEdit(t)}><Pencil size={12} /></button>
                    <button className="btn-ghost btn-sm" onClick={() => remove(t.id)} style={{ color: 'var(--red)' }}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
