'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, FileText, Loader2, Paperclip, Plus, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import {
  HS_COMPLETION_OUTCOME_LABELS, HS_COMPLETION_OUTCOMES, HS_RECURRENCE_UNITS, HS_REGISTER_CATEGORIES,
  HS_REGISTER_CATEGORY_LABELS,
  type HsCompletionOutcome, type HsRecurrenceUnit, type HsRegisterCategory,
} from '@/lib/hs/vocab';
import { describeRecurrence, nextDue, ragFor, type Rag } from '@/lib/hs/recurrence';
import { HS_EVIDENCE_ACCEPT, evidenceUrl, uploadEvidence } from '@/lib/hs/evidence';
import type { HsCompletion, HsFile, HsRegisterItem } from '@/lib/hs/types';

interface Props {
  companyId:   string;
  canRecord:   boolean;
  items:       HsRegisterItem[];
  completions: HsCompletion[];
  files:       HsFile[];
  loadError:   string | null;
}

const RAG: Record<Rag, { label: string; colour: string; icon: React.ElementType }> = {
  red:      { label: 'Overdue',  colour: 'var(--red)',       icon: AlertTriangle },
  amber:    { label: 'Due soon', colour: 'var(--gold)',      icon: Clock },
  green:    { label: 'On track', colour: 'var(--teal)',      icon: ShieldCheck },
  complete: { label: 'Complete', colour: 'var(--ink-faint)', icon: CheckCircle2 },
  none:     { label: 'No date',  colour: 'var(--ink-faint)', icon: Clock },
};

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
const categoryLabel = (c: string | null) =>
  (c && (HS_REGISTER_CATEGORY_LABELS as Record<string, string>)[c]) || (c === 'health_safety' ? 'Health & safety' : c ?? '');

export default function RegisterClient({ companyId, canRecord, items, completions, files, loadError }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const byItem = useMemo(() => {
    const m = new Map<string, HsCompletion[]>();
    for (const c of completions) m.set(c.item_id, [...(m.get(c.item_id) ?? []), c]);
    return m;
  }, [completions]);

  const filesFor = (type: string, id: string) => files.filter(f => f.entity_type === type && f.entity_id === id);

  const summary = useMemo(() => {
    const s = { red: 0, amber: 0, green: 0 };
    for (const i of items) {
      const r = ragFor(i.status, i.due_date);
      if (r === 'red' || r === 'amber' || r === 'green') s[r]++;
    }
    return s;
  }, [items]);

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load the register: {loadError}</p>}

      <div className="flex flex-wrap items-center gap-4">
        {(['red', 'amber', 'green'] as const).map(r => {
          const Icon = RAG[r].icon;
          return (
            <span key={r} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: RAG[r].colour }}>
              <Icon size={15} /> {summary[r]} {RAG[r].label.toLowerCase()}
            </span>
          );
        })}
        {canRecord && (
          <button className="btn-cta btn-sm ml-auto" onClick={() => setAdding(a => !a)}>
            <Plus size={14} /> Add register item
          </button>
        )}
      </div>

      {adding && <AddItemForm companyId={companyId} onDone={() => setAdding(false)} />}

      {items.length === 0 ? (
        <div className="card empty-state p-10">
          <ShieldCheck size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No H&amp;S register items for this client yet.</p>
        </div>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
          {items.map(item => {
            const rag = ragFor(item.status, item.due_date);
            const R = RAG[rag];
            const isOpen = open === item.id;
            const history = byItem.get(item.id) ?? [];
            return (
              <li key={item.id}>
                <button
                  className="w-full flex items-center gap-3 p-4 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : item.id)}
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <R.icon size={16} style={{ color: R.colour, flexShrink: 0 }} aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate" style={{ color: 'var(--ink)' }}>{item.title}</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
                      {categoryLabel(item.category)} · {describeRecurrence(item.recurrence_every, item.recurrence_unit)}
                      {item.last_completed_on && ` · last done ${fmt(item.last_completed_on)}`}
                    </span>
                  </span>
                  <span className="text-right text-sm whitespace-nowrap">
                    <span className="block font-medium" style={{ color: R.colour }}>{R.label}</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{item.status === 'complete' ? '' : `due ${fmt(item.due_date)}`}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pl-11 space-y-4">
                    {item.description && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item.description}</p>}
                    {item.legal_basis && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Legal basis: {item.legal_basis}</p>}
                    <FileList files={filesFor('register_item', item.id)} />

                    {canRecord && <CompletionForm companyId={companyId} item={item} />}

                    <div>
                      <h3 className="label">History</h3>
                      {history.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Nothing recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {history.map(c => (
                            <li key={c.id} className="text-sm rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                              <div className="flex flex-wrap gap-x-3">
                                <strong style={{ color: 'var(--ink)' }}>{fmt(c.completed_on)}</strong>
                                <span style={{ color: c.outcome === 'fail' ? 'var(--red)' : 'var(--ink-soft)' }}>{HS_COMPLETION_OUTCOME_LABELS[c.outcome]}</span>
                                <span style={{ color: 'var(--ink-faint)' }}>by {c.recorded_by_kind}</span>
                                {c.next_due_on && <span style={{ color: 'var(--ink-faint)' }}>next due {fmt(c.next_due_on)}</span>}
                              </div>
                              {c.notes && <p className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{c.notes}</p>}
                              <FileList files={filesFor('register_completion', c.id)} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FileList({ files }: { files: HsFile[] }) {
  const { toast } = useToast();
  if (files.length === 0) return null;
  async function openFile(f: HsFile) {
    const url = await evidenceUrl(createClient(), f.storage_path);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Could not open that file.', 'error');
  }
  return (
    <ul className="mt-1 flex flex-wrap gap-2">
      {files.map(f => (
        <li key={f.id}>
          <button className="btn-ghost btn-sm" onClick={() => openFile(f)}><FileText size={13} /> {f.file_name}</button>
        </li>
      ))}
    </ul>
  );
}

function AddItemForm({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HsRegisterCategory>('hs_risk_assessment');
  const [dueDate, setDueDate] = useState(today());
  const [every, setEvery] = useState('12');
  const [unit, setUnit] = useState<HsRecurrenceUnit | ''>('month');
  const [legal, setLegal] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const recurs = unit !== '' && Number(every) > 0;
    const { error } = await createClient().from('compliance_items').insert({
      company_id: companyId, title: title.trim(), category, due_date: dueDate || null,
      recurrence_every: recurs ? Number(every) : null, recurrence_unit: recurs ? unit : null,
      legal_basis: legal.trim() || null, description: description.trim() || null,
    }).select('id').single();
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Register item added', 'success');
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
      <label className="block md:col-span-2">
        <span className="label">What needs doing</span>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required placeholder="Fire risk assessment review" />
      </label>
      <label className="block">
        <span className="label">Category</span>
        <select className="input" value={category} onChange={e => setCategory(e.target.value as HsRegisterCategory)}>
          {HS_REGISTER_CATEGORIES.map(c => <option key={c} value={c}>{HS_REGISTER_CATEGORY_LABELS[c]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">First due</span>
        <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
      </label>
      <div className="grid grid-cols-[1fr_1.5fr] gap-2">
        <label className="block">
          <span className="label">Repeats every</span>
          <input className="input" type="number" min={1} max={120} value={every} onChange={e => setEvery(e.target.value)} disabled={unit === ''} />
        </label>
        <label className="block">
          <span className="label">&nbsp;</span>
          <select className="input" value={unit} onChange={e => setUnit(e.target.value as HsRecurrenceUnit | '')}>
            <option value="">Does not repeat</option>
            {HS_RECURRENCE_UNITS.map(u => <option key={u} value={u}>{u}s</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Legal basis (optional)</span>
        <input className="input" value={legal} onChange={e => setLegal(e.target.value)} maxLength={300} placeholder="Regulatory Reform (Fire Safety) Order 2005" />
      </label>
      <label className="block md:col-span-2">
        <span className="label">Notes (optional)</span>
        <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} />
      </label>
      <div className="md:col-span-2 flex gap-2 justify-end">
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
        <button className="btn-cta" disabled={busy || !title.trim()}>{busy && <Loader2 size={15} className="animate-spin" />} Add item</button>
      </div>
    </form>
  );
}

function CompletionForm({ companyId, item }: { companyId: string; item: HsRegisterItem }) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = useState(today());
  const [outcome, setOutcome] = useState<HsCompletionOutcome>('pass');
  const [notes, setNotes] = useState('');
  const [fileList, setFileList] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const preview = nextDue(on, item.recurrence_every, item.recurrence_unit);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    // company_id is overwritten by the database from the item itself
    // (hs_completion_fill); it is sent only because the column is NOT NULL.
    const { data, error } = await supabase.from('hs_register_completions').insert({
      item_id: item.id, company_id: companyId, completed_on: on, outcome, notes: notes.trim() || null,
    }).select('id').single();
    if (error || !data) { setBusy(false); toast(error?.message ?? 'Could not record it.', 'error'); return; }

    const problems: string[] = [];
    for (const file of fileList) {
      const p = await uploadEvidence(supabase, { companyId, entityType: 'register_completion', entityId: data.id, file });
      if (p) problems.push(p);
    }
    setBusy(false);
    if (problems.length) toast(`Recorded, but: ${problems.join(' ')}`, 'error');
    else toast('Recorded', 'success');
    setNotes(''); setFileList([]);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-lg p-3 space-y-3" style={{ border: '1px solid var(--line)' }}>
      <h3 className="label">Record it done</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Done on</span>
          <input className="input" type="date" value={on} max={today()} onChange={e => setOn(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Outcome</span>
          <select className="input" value={outcome} onChange={e => setOutcome(e.target.value as HsCompletionOutcome)}>
            {HS_COMPLETION_OUTCOMES.map(o => <option key={o} value={o}>{HS_COMPLETION_OUTCOME_LABELS[o]}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Notes (optional)</span>
        <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} />
      </label>
      <label className="block">
        <span className="label flex items-center gap-1.5"><Paperclip size={13} /> Evidence (certificate, report, photos)</span>
        <input
          type="file" multiple accept={HS_EVIDENCE_ACCEPT.join(',')}
          onChange={e => setFileList(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-cta btn-sm" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {preview ? `Next due ${fmt(preview)}` : 'One-off: this will mark it complete'}
        </span>
      </div>
    </form>
  );
}
