'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useToast } from '@/components/modules/Toast';
import { COMPLAINT_SOURCES, COMPLAINT_SOURCE_LABELS, type ComplaintSource } from '@/lib/hs/vocab';
import type { EnvironmentalComplaint } from '@/lib/hs/types';

interface Props {
  companyId: string;
  complaints: EnvironmentalComplaint[];
  loadError: string | null;
}

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Core-OS 360 Phase 5, Group 7 (162): the exact Group 2 spills/waste
// shape — a simple, insert-mostly environmental register record.
export default function EnvironmentalComplaintsClient({ companyId, complaints, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<ComplaintSource>('neighbour');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('environmental_complaints').insert({
      company_id: companyId, source, description: description.trim(),
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Complaint recorded', 'success');
    setDescription(''); setOpen(false);
    router.refresh();
  }

  async function markInvestigated(c: EnvironmentalComplaint) {
    const outcome = window.prompt('Outcome of the investigation (leave blank to cancel):');
    if (outcome === null) return;
    const res = await createClient().from('environmental_complaints')
      .update({ investigated: true, outcome: outcome.trim() || null }, COUNT_EXACT).eq('id', c.id);
    const result = judgeWrite({ error: res.error, count: res.count });
    if (!result.ok) { toast(result.message ?? 'Could not update the complaint.', 'error'); return; }
    router.refresh();
  }

  async function close(c: EnvironmentalComplaint) {
    const res = await createClient().from('environmental_complaints')
      .update({ closed_at: new Date().toISOString() }, COUNT_EXACT).eq('id', c.id);
    const outcome = judgeWrite({ error: res.error, count: res.count });
    if (!outcome.ok) { toast(outcome.message ?? 'Could not close the complaint.', 'error'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load complaints: {loadError}</p>}
      <div className="flex">
        <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Log complaint</button>
      </div>

      {open && (
        <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">Source</span>
            <select className="input" value={source} onChange={e => setSource(e.target.value as ComplaintSource)}>
              {COMPLAINT_SOURCES.map(s => <option key={s} value={s}>{COMPLAINT_SOURCE_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="label">Description</span>
            <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} required />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !description.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Save
            </button>
          </div>
        </form>
      )}

      {complaints.length === 0 ? (
        <div className="card empty-state p-10">
          <AlertTriangle size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No environmental complaints recorded.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {complaints.map(c => (
            <li key={c.id} className="card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="badge">{COMPLAINT_SOURCE_LABELS[c.source]}</span>
                {c.investigated && <span className="badge" style={{ color: 'var(--teal)' }}>Investigated</span>}
                {c.closed_at && <span className="badge" style={{ color: 'var(--ink-faint)' }}>Closed</span>}
                <span className="text-sm ml-auto" style={{ color: 'var(--ink-faint)' }}>{fmt(c.received_at)}</span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{c.description}</p>
              {c.outcome && <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>Outcome: {c.outcome}</p>}
              <div className="mt-3 flex gap-2">
                {!c.investigated && <button className="btn-secondary btn-sm" onClick={() => markInvestigated(c)}>Mark investigated</button>}
                {!c.closed_at && <button className="btn-secondary btn-sm" onClick={() => close(c)}>Close</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
