'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RAMS_ACK_METHODS, RAMS_ACK_METHOD_LABELS } from '@/lib/hs/safetyVocab';

const DEFAULT_CONFIRMATION = 'I have read and understood this method statement and will carry out the work as it describes.';

// Record that a person acknowledged this APPROVED version
// (rams_acknowledgements, 124). Insert-only evidence: the database
// stamps the version, the organisation and who recorded it, and refuses
// anything but an approved or active RAMS. A mistake is corrected by a
// new record, never an edit.
export default function RamsAcknowledge({ msId, people }: { msId: string; people: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState('');
  const [method, setMethod] = useState<string>('in_person');
  const [confirmation, setConfirmation] = useState(DEFAULT_CONFIRMATION);
  const [sessionRef, setSessionRef] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await createClient().from('rams_acknowledgements').insert({
      method_statement_id: msId, person_id: person, method, confirmation: confirmation.trim(),
      session_ref: sessionRef.trim() || null,
      ...(when ? { acknowledged_at: new Date(when).toISOString() } : {}),
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setPerson(''); setSessionRef(''); setWhen('');
    setMsg({ ok: true, text: 'Acknowledgement recorded.' });
    router.refresh();
  }

  if (!open) {
    return <button type="button" className="btn-secondary btn-sm no-print" style={{ minHeight: 40 }} onClick={() => setOpen(true)}>Record acknowledgement</button>;
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 pt-2 no-print" style={{ borderTop: '1px solid var(--line)' }}>
      <label className="block"><span className="label">Person</span>
        <select className="input" value={person} onChange={e => setPerson(e.target.value)} required>
          <option value="">Choose…</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        {people.length === 0 && <span className="block text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>No people are listed for this organisation that you can see.</span>}
      </label>
      <label className="block"><span className="label">How</span>
        <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
          {RAMS_ACK_METHODS.map(m => <option key={m} value={m}>{RAMS_ACK_METHOD_LABELS[m]}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2"><span className="label">Confirmation given</span>
        <textarea className="input" rows={2} value={confirmation} onChange={e => setConfirmation(e.target.value)} maxLength={1000} required /></label>
      <label className="block"><span className="label">When (optional — defaults to now)</span>
        <input className="input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></label>
      <label className="block"><span className="label">Briefing / session reference (optional)</span>
        <input className="input" value={sessionRef} onChange={e => setSessionRef(e.target.value)} maxLength={200} placeholder="e.g. Toolbox talk 12 May" /></label>
      {msg && <p className="sm:col-span-2 text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn-cta btn-sm" disabled={busy || !person || !confirmation.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} Record</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}
