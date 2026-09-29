'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';
import { CONSULTATION_METHODS, CONSULTATION_METHOD_LABELS, type ConsultationMethod } from '@/lib/hs/vocab';
import type { ConsultationRecord } from '@/lib/hs/types';

interface Props {
  companyId: string;
  records: ConsultationRecord[];
  loadError: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Core-OS 360 Phase 5, Group 7 (162): simple record-keeping, not a
// workflow engine. Staff-managed; the client reads it read-only.
export default function ConsultationClient({ companyId, records, loadError }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [topic, setTopic] = useState('');
  const [method, setMethod] = useState<ConsultationMethod>('meeting');
  const [participants, setParticipants] = useState('');
  const [outcome, setOutcome] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('consultation_records').insert({
      company_id: companyId, consultation_date: date, topic: topic.trim(), method,
      participants: participants.split(',').map(p => p.trim()).filter(Boolean),
      outcome_summary: outcome.trim() || null,
    });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Consultation recorded', 'success');
    setTopic(''); setParticipants(''); setOutcome(''); setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="card p-3 text-sm" style={{ color: 'var(--red)' }}>Could not load consultation records: {loadError}</p>}
      <div className="flex">
        <button className="btn-cta btn-sm ml-auto" onClick={() => setOpen(o => !o)}><Plus size={14} /> Record consultation</button>
      </div>

      {open && (
        <form onSubmit={submit} className="card p-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">Date</span>
            <input className="input" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} required />
          </label>
          <label className="block">
            <span className="label">Method</span>
            <select className="input" value={method} onChange={e => setMethod(e.target.value as ConsultationMethod)}>
              {CONSULTATION_METHODS.map(m => <option key={m} value={m}>{CONSULTATION_METHOD_LABELS[m]}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="label">Topic</span>
            <input className="input" value={topic} onChange={e => setTopic(e.target.value)} maxLength={300} required placeholder="e.g. Fire evacuation review" />
          </label>
          <label className="block md:col-span-2">
            <span className="label">Participants (comma-separated)</span>
            <input className="input" value={participants} onChange={e => setParticipants(e.target.value)} placeholder="Alice, Bob" />
          </label>
          <label className="block md:col-span-2">
            <span className="label">Outcome</span>
            <textarea className="input" rows={3} value={outcome} onChange={e => setOutcome(e.target.value)} maxLength={4000} />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-cta" disabled={busy || !topic.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Save
            </button>
          </div>
        </form>
      )}

      {records.length === 0 ? (
        <div className="card empty-state p-10">
          <Users size={28} style={{ color: 'var(--ink-faint)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>No worker consultation recorded yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {records.map(r => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong style={{ color: 'var(--ink)' }}>{r.topic}</strong>
                <span className="badge">{CONSULTATION_METHOD_LABELS[r.method]}</span>
                <span className="text-sm ml-auto" style={{ color: 'var(--ink-faint)' }}>{fmt(r.consultation_date)}</span>
              </div>
              {r.participants.length > 0 && <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Participants: {r.participants.join(', ')}</p>}
              {r.outcome_summary && <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{r.outcome_summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
