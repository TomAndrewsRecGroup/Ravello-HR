'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Lightbulb, Send, Archive as ArchiveIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import {
  LESSON_LEARNED_CATEGORIES, LESSON_LEARNED_CATEGORY_LABELS, LESSON_LEARNED_SOURCE_TYPES, LESSON_LEARNED_SOURCE_TYPE_LABELS,
  type LessonLearned, type LessonLearnedCategory, type LessonLearnedDistribution, type LessonLearnedRead, type LessonLearnedSourceType,
} from '@/lib/lessonsLearned/types';
import { suggestDistributionTargets, type DistributionCandidate } from '@/lib/lessonsLearned/suggestDistribution';

interface Props {
  lessons: LessonLearned[];
  loadError: string | null;
  distributions: LessonLearnedDistribution[];
  reads: LessonLearnedRead[];
  companies: DistributionCandidate[];
}

const STATUS_COLOUR: Record<LessonLearned['status'], string> = {
  draft: 'var(--ink-faint)', published: 'var(--teal)', archived: 'var(--ink-faint)',
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Core-OS 360 Phase 16, Group 2. Staff authors a deliberately
// anonymised lesson (never the raw source record), then publishes it
// to a chosen set of clients. Distribution targeting is a plain sector
// match (lib/lessonsLearned/suggestDistribution.ts) — a pre-selection
// convenience only; staff always confirms the final list before
// anything is sent.
export default function LessonsLearnedClient({ lessons, loadError, distributions, reads, companies }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<LessonLearnedCategory>('people');
  const [summary, setSummary] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [sourceType, setSourceType] = useState<LessonLearnedSourceType | 'none'>('none');
  const [sourceId, setSourceId] = useState('');

  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [refCompanyId, setRefCompanyId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishBusy, setPublishBusy] = useState(false);

  function resetForm() {
    setTitle(''); setCategory('people'); setSummary(''); setRecommendedAction('');
    setSourceType('none'); setSourceId(''); setEditingId(null); setOpen(false);
  }

  function startEdit(l: LessonLearned) {
    setEditingId(l.id); setTitle(l.title); setCategory(l.category); setSummary(l.summary);
    setRecommendedAction(l.recommended_action ?? ''); setSourceType(l.source_type ?? 'none');
    setSourceId(l.source_id ?? ''); setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      title: title.trim(), category, summary: summary.trim(),
      recommended_action: recommendedAction.trim() || null,
      source_type: sourceType === 'none' ? null : sourceType,
      source_id: sourceType === 'none' ? null : (sourceId.trim() || null),
    };
    const sb = createClient();
    if (editingId) {
      const res = await sb.from('lessons_learned').update(payload, COUNT_EXACT).eq('id', editingId);
      setBusy(false);
      const out = judgeWrite({ error: res.error, count: res.count }, 'The lesson');
      if (!out.ok) { toast(out.message!, 'error'); return; }
    } else {
      const { error } = await sb.from('lessons_learned').insert(payload);
      setBusy(false);
      if (error) { toast(error.message, 'error'); return; }
    }
    toast(editingId ? 'Lesson updated' : 'Lesson drafted', 'success');
    resetForm();
    router.refresh();
  }

  async function archive(l: LessonLearned) {
    const sb = createClient();
    const res = await sb.from('lessons_learned').update({ status: 'archived' }, COUNT_EXACT).eq('id', l.id);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The lesson');
    if (!out.ok) { toast(out.message!, 'error'); return; }
    toast('Lesson archived', 'success');
    router.refresh();
  }

  function openPublish(l: LessonLearned) {
    setPublishingId(l.id);
    setRefCompanyId('');
    setSelected(new Set(distributions.filter(d => d.lesson_id === l.id).map(d => d.company_id)));
  }

  function pickReference(companyId: string) {
    setRefCompanyId(companyId);
    const suggested = suggestDistributionTargets(companies, companyId || null);
    setSelected(prev => new Set([...prev, ...suggested]));
  }

  function toggleCompany(id: string, alreadyDistributed: boolean) {
    if (alreadyDistributed) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function confirmPublish() {
    if (!publishingId) return;
    const already = new Set(distributions.filter(d => d.lesson_id === publishingId).map(d => d.company_id));
    const companyIds = [...selected].filter(id => !already.has(id));
    setPublishBusy(true);
    const res = await fetch(`/api/admin/lessons-learned/${publishingId}/publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyIds }),
    });
    const body = await res.json().catch(() => ({}));
    setPublishBusy(false);
    if (!res.ok) { toast(body.error ?? 'Could not publish this lesson.', 'error'); return; }
    toast(companyIds.length > 0 ? `Published and shared with ${companyIds.length} client(s)` : 'Published', 'success');
    setPublishingId(null);
    router.refresh();
  }

  const publishing = lessons.find(l => l.id === publishingId) ?? null;
  const activeCompanies = companies.filter(c => c.active);

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>{loadError}</p>}
      <div className="flex">
        <button type="button" className="btn-cta btn-sm ml-auto" onClick={() => (open ? resetForm() : setOpen(true))}>
          <Plus size={14} className="mr-1" /> New lesson
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="card p-4 grid grid-cols-2 gap-3 items-end">
          <div className="col-span-2">
            <label className="label">Title</label>
            <input className="input" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Unsecured ladder led to a near miss on a roof job" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as LessonLearnedCategory)}>
              {LESSON_LEARNED_CATEGORIES.map(c => <option key={c} value={c}>{LESSON_LEARNED_CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Drawn from (staff traceability only — never shown to any client)</label>
            <div className="flex gap-2">
              <select className="input" value={sourceType} onChange={e => setSourceType(e.target.value as LessonLearnedSourceType | 'none')}>
                <option value="none">Manual — no linked record</option>
                {LESSON_LEARNED_SOURCE_TYPES.map(t => <option key={t} value={t}>{LESSON_LEARNED_SOURCE_TYPE_LABELS[t]}</option>)}
              </select>
              {sourceType !== 'none' && (
                <input className="input" value={sourceId} onChange={e => setSourceId(e.target.value)} placeholder="Record id (from its own page)" />
              )}
            </div>
          </div>
          <div className="col-span-2">
            <label className="label">Anonymised summary (this is what clients will read)</label>
            <textarea className="input" rows={4} required maxLength={4000} value={summary} onChange={e => setSummary(e.target.value)}
              placeholder="Describe what happened and what was learned, in general terms — no names, no client-identifying detail." />
          </div>
          <div className="col-span-2">
            <label className="label">Recommended action (optional)</label>
            <textarea className="input" rows={2} maxLength={2000} value={recommendedAction} onChange={e => setRecommendedAction(e.target.value)}
              placeholder="What should another client do differently as a result?" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-cta btn-sm" disabled={busy}>{busy ? 'Saving…' : (editingId ? 'Save changes' : 'Save as draft')}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {lessons.length === 0 ? (
        <div className="card empty-state p-10">
          <Lightbulb size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No lessons drafted yet.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Lesson</th><th>Category</th><th>Status</th><th>Shared with</th><th>Read by</th><th></th></tr></thead>
            <tbody>
              {lessons.map(l => {
                const distCount = distributions.filter(d => d.lesson_id === l.id).length;
                const readCount = reads.filter(r => r.lesson_id === l.id).length;
                return (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.title}</strong>
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{l.summary.slice(0, 140)}{l.summary.length > 140 ? '…' : ''}</p>
                    </td>
                    <td><span className="badge">{LESSON_LEARNED_CATEGORY_LABELS[l.category] ?? l.category}</span></td>
                    <td><span className="font-medium" style={{ color: STATUS_COLOUR[l.status] }}>{l.status}</span></td>
                    <td>{distCount} client{distCount === 1 ? '' : 's'}</td>
                    <td>{readCount}</td>
                    <td>
                      <div className="flex gap-1.5 justify-end">
                        {l.status === 'draft' && (
                          <button type="button" className="btn-ghost btn-sm" onClick={() => startEdit(l)}>Edit</button>
                        )}
                        {l.status !== 'archived' && (
                          <button type="button" className="btn-secondary btn-sm flex items-center gap-1" onClick={() => openPublish(l)}>
                            <Send size={13} /> {l.status === 'published' ? 'Distribute more' : 'Publish'}
                          </button>
                        )}
                        {l.status === 'published' && (
                          <button type="button" className="btn-ghost btn-sm flex items-center gap-1" onClick={() => archive(l)}>
                            <ArchiveIcon size={13} /> Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {publishing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(7,11,29,0.5)' }}>
          <div className="card p-5 space-y-4 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>Publish &amp; distribute: {publishing.title}</h3>
            <label className="block">
              <span className="label">Suggest by sector similarity to (optional)</span>
              <select className="input" value={refCompanyId} onChange={e => pickReference(e.target.value)}>
                <option value="">Choose a reference client…</option>
                {activeCompanies.map(c => <option key={c.id} value={c.id}>{c.name}{c.sector ? ` (${c.sector})` : ''}</option>)}
              </select>
            </label>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {activeCompanies.map(c => {
                const already = distributions.some(d => d.lesson_id === publishing.id && d.company_id === c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm" style={{ opacity: already ? 0.6 : 1 }}>
                    <input type="checkbox" checked={selected.has(c.id) || already} disabled={already} onChange={() => toggleCompany(c.id, already)} />
                    {c.name}{c.sector ? <span style={{ color: 'var(--ink-faint)' }}> — {c.sector}</span> : null}
                    {already && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>(already shared)</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPublishingId(null)}>Cancel</button>
              <button type="button" className="btn-cta btn-sm" disabled={publishBusy} onClick={confirmPublish}>
                {publishBusy ? 'Publishing…' : 'Publish & share'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
