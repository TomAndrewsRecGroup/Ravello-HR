'use client';

// Core-OS 360 Phase 6, Group 7: the write UI for two things Client 360
// could previously only DISPLAY — a service scope (section 5) and a
// manual Service Ledger entry (section 9's "authorised manual service
// entries"). Both post to a validated API route rather than writing
// directly from the browser: RLS is still the real authorization
// boundary (see each route's own header comment), but a route gives
// one place to validate the request shape and, for the ledger entry,
// fire the app-level service_ledger.entry_created audit event.
//
// Both forms call router.refresh() on success rather than managing
// their own local list state — Client 360 is a server component, and
// refresh() re-runs its data fetch, so the new row appears exactly
// the way every other section on this page already renders it.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { SERVICE_TYPE_LABELS, REVIEW_FREQUENCY_LABELS, SERVICE_TYPES, REVIEW_FREQUENCIES } from '@/lib/consultancy/vocab';
import { useUnsavedChangesWarning } from '@/components/ui/useUnsavedChangesWarning';

interface Props {
  clientId: string;
}

export default function ClientActionForms({ clientId }: Props) {
  const router = useRouter();
  const [openForm, setOpenForm] = useState<'scope' | 'ledger' | null>(null);

  return (
    <section className="card p-4 space-y-3">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Record something for this client</h2>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" onClick={() => setOpenForm(openForm === 'scope' ? null : 'scope')}>
          <Plus size={13} /> Add service scope
        </button>
        <button className="btn-secondary btn-sm" onClick={() => setOpenForm(openForm === 'ledger' ? null : 'ledger')}>
          <Plus size={13} /> Add manual ledger note
        </button>
      </div>
      {openForm === 'scope' && <ServiceScopeForm clientId={clientId} onSaved={() => { setOpenForm(null); router.refresh(); }} />}
      {openForm === 'ledger' && <LedgerEntryForm clientId={clientId} onSaved={() => { setOpenForm(null); router.refresh(); }} />}
    </section>
  );
}

function ServiceScopeForm({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [serviceType, setServiceType] = useState<string>(SERVICE_TYPES[0]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [reviewFrequency, setReviewFrequency] = useState<string>('');
  const [includedScope, setIncludedScope] = useState('');
  const [excludedScope, setExcludedScope] = useState('');
  const [commercialReference, setCommercialReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useUnsavedChangesWarning(!!(includedScope || excludedScope || commercialReference || reviewFrequency));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch(`/api/consultancy/clients/${clientId}/service-scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: serviceType,
        start_date: startDate,
        review_frequency: reviewFrequency || null,
        included_scope: includedScope || null,
        excluded_scope: excludedScope || null,
        commercial_reference: commercialReference || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not save service scope');
      setSaving(false);
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="grid sm:grid-cols-2 gap-2">
        <select className="input" value={serviceType} onChange={e => setServiceType(e.target.value)}>
          {SERVICE_TYPES.map(t => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
        </select>
        <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        <select className="input" value={reviewFrequency} onChange={e => setReviewFrequency(e.target.value)}>
          <option value="">No fixed review frequency</option>
          {REVIEW_FREQUENCIES.map(f => <option key={f} value={f}>{REVIEW_FREQUENCY_LABELS[f]}</option>)}
        </select>
        <input className="input" placeholder="Commercial reference (optional)" value={commercialReference} onChange={e => setCommercialReference(e.target.value)} />
      </div>
      <textarea className="input" rows={2} placeholder="Included scope (optional)" value={includedScope} onChange={e => setIncludedScope(e.target.value)} />
      <textarea className="input" rows={2} placeholder="Excluded scope (optional)" value={excludedScope} onChange={e => setExcludedScope(e.target.value)} />
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
      <button type="submit" disabled={saving} className="btn-cta btn-sm">
        {saving && <Loader2 size={13} className="animate-spin" />} {saving ? 'Saving…' : 'Save service scope'}
      </button>
    </form>
  );
}

function LedgerEntryForm({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [summary, setSummary] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useUnsavedChangesWarning(!!summary);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch(`/api/consultancy/clients/${clientId}/ledger-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, occurred_at: occurredAt }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not save ledger entry');
      setSaving(false);
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
      <textarea
        className="input"
        rows={3}
        placeholder="What was delivered — e.g. 'Called the client to talk through the Q3 audit findings.'"
        value={summary}
        onChange={e => setSummary(e.target.value)}
        required
      />
      <input type="date" className="input" style={{ maxWidth: 200 }} value={occurredAt} onChange={e => setOccurredAt(e.target.value)} />
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
      <button type="submit" disabled={saving} className="btn-cta btn-sm">
        {saving && <Loader2 size={13} className="animate-spin" />} {saving ? 'Saving…' : 'Save ledger note'}
      </button>
    </form>
  );
}
