'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import EvidencePanel, { type EvidenceFile } from '@/components/safety/EvidencePanel';

export interface Step { id: string; sequence_number: number; title: string; description: string | null; hazards: string | null;
  controls: string | null; responsible_role: string | null }

const blank = { title: '', description: '', hazards: '', controls: '', responsible_role: '' };
type Draft = typeof blank;

// The ordered work sequence (method_statement_steps). Steps change only
// while the RAMS is a draft (hs_doc_child_guard); reordering sends the
// full ordered id list to hs_reorder_steps in one statement.
export default function RamsSteps({ msId, companyId, steps, editable, files, canUpload }: {
  msId: string; companyId: string; steps: Step[]; editable: boolean;
  files: Record<string, EvidenceFile[]>; canUpload: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const t = (v: string) => v.trim() || null;

  function startEdit(s: Step) {
    setAdding(false); setEditing(s.id); setError(null);
    setDraft({ title: s.title, description: s.description ?? '', hazards: s.hazards ?? '', controls: s.controls ?? '', responsible_role: s.responsible_role ?? '' });
  }

  async function saveNew() {
    setBusy(true); setError(null);
    const next = steps.reduce((m, s) => Math.max(m, s.sequence_number), 0) + 1;
    const { error: err } = await createClient().from('method_statement_steps').insert({
      method_statement_id: msId, company_id: companyId, sequence_number: next, title: draft.title.trim(),
      description: t(draft.description), hazards: t(draft.hazards), controls: t(draft.controls), responsible_role: t(draft.responsible_role),
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setAdding(false); setDraft(blank);
    router.refresh();
  }

  async function saveEdit(id: string) {
    setBusy(true); setError(null);
    const res = await createClient().from('method_statement_steps').update({
      title: draft.title.trim(), description: t(draft.description), hazards: t(draft.hazards), controls: t(draft.controls),
      responsible_role: t(draft.responsible_role),
    }, COUNT_EXACT).eq('id', id);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The step');
    if (!out.ok) { setError(out.message); return; }
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this step?')) return;
    setBusy(true); setError(null);
    const { error: err, count } = await createClient().from('method_statement_steps').delete({ count: 'exact' }).eq('id', id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (count === 0) { setError('The step was not deleted. You may not have permission, or it was already removed.'); return; }
    router.refresh();
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = steps.map(s => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setBusy(true); setError(null);
    const { error: err } = await createClient().rpc('hs_reorder_steps', { p_method_statement: msId, p_step_ids: ids });
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  const form = (onSave: () => void, label: string) => (
    <div className="grid gap-2 sm:grid-cols-2 p-3 rounded" style={{ background: 'var(--surface-soft)' }}>
      <label className="block sm:col-span-2"><span className="label">Step</span>
        <input className="input" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} maxLength={200} required /></label>
      <label className="block sm:col-span-2"><span className="label">What is done</span>
        <textarea className="input" rows={2} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} maxLength={4000} /></label>
      <label className="block"><span className="label">Hazards</span>
        <textarea className="input" rows={2} value={draft.hazards} onChange={e => setDraft(d => ({ ...d, hazards: e.target.value }))} maxLength={2000} /></label>
      <label className="block"><span className="label">Controls</span>
        <textarea className="input" rows={2} value={draft.controls} onChange={e => setDraft(d => ({ ...d, controls: e.target.value }))} maxLength={2000} /></label>
      <label className="block sm:col-span-2"><span className="label">Responsible role</span>
        <input className="input" value={draft.responsible_role} onChange={e => setDraft(d => ({ ...d, responsible_role: e.target.value }))} maxLength={200}
          placeholder="e.g. Site supervisor" /></label>
      <div className="sm:col-span-2 flex gap-2">
        <button type="button" className="btn-cta btn-sm" onClick={onSave} disabled={busy || !draft.title.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} {label}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {steps.length === 0 && !adding && (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
          No work steps yet. {editable ? 'Set out the job in the order it is done — a RAMS needs at least one step before it can be submitted.' : ''}
        </p>
      )}
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id} className="p-3 rounded" style={{ border: '1px solid var(--line)' }}>
            {editing === s.id ? form(() => saveEdit(s.id), 'Save step') : (
              <>
                <div className="flex flex-wrap items-start gap-2">
                  <span className="font-mono text-xs pt-0.5" style={{ color: 'var(--ink-faint)' }}>{i + 1}.</span>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-medium" style={{ color: 'var(--ink)' }}>{s.title}</p>
                    {s.description && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{s.description}</p>}
                  </div>
                  {editable && (
                    <div className="flex gap-1 no-print">
                      <button type="button" className="btn-icon" aria-label="Move up" onClick={() => move(i, -1)} disabled={busy || i === 0}><ArrowUp size={14} /></button>
                      <button type="button" className="btn-icon" aria-label="Move down" onClick={() => move(i, 1)} disabled={busy || i === steps.length - 1}><ArrowDown size={14} /></button>
                      <button type="button" className="btn-icon" aria-label="Edit step" onClick={() => startEdit(s)} disabled={busy}><Pencil size={14} /></button>
                      <button type="button" className="btn-icon" aria-label="Delete step" onClick={() => remove(s.id)} disabled={busy}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                <dl className="grid gap-2 sm:grid-cols-3 text-sm mt-2">
                  <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Hazards</dt><dd className="whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{s.hazards ?? '—'}</dd></div>
                  <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Controls</dt><dd className="whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{s.controls ?? '—'}</dd></div>
                  <div><dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>Responsible</dt><dd style={{ color: 'var(--ink-soft)' }}>{s.responsible_role ?? '—'}</dd></div>
                </dl>
                <div className="mt-2">
                  <button type="button" className="btn-ghost btn-sm no-print" onClick={() => setOpenEvidence(o => (o === s.id ? null : s.id))}>
                    Attachments ({(files[s.id] ?? []).length})
                  </button>
                  {openEvidence === s.id && (
                    <EvidencePanel companyId={companyId} entityType="method_statement_step" entityId={s.id} files={files[s.id] ?? []} canUpload={canUpload} />
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
      {adding && form(saveNew, 'Add step')}
      {editable && !adding && (
        <button type="button" className="btn-secondary btn-sm no-print" style={{ minHeight: 40 }}
          onClick={() => { setEditing(null); setDraft(blank); setAdding(true); setError(null); }}>
          <Plus size={14} /> Add step
        </button>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
