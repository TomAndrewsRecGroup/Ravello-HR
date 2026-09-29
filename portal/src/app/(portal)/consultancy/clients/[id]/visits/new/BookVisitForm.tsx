'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { VISIT_TYPES, VISIT_TYPE_LABELS, VISIT_TEMPLATE_CATEGORY_LABELS } from '@/lib/consultancy/vocab';
import type { ConsultancyVisitTemplate } from '@/lib/consultancy/types';

interface Props {
  clientId: string;
  clientName: string;
  templates: ConsultancyVisitTemplate[];
}

export default function BookVisitForm({ clientId, clientName, templates }: Props) {
  const router = useRouter();
  const [visitType, setVisitType] = useState<string>(VISIT_TYPES[0]);
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch(`/api/consultancy/clients/${clientId}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_type: visitType, scheduled_date: scheduledDate, template_id: templateId || null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not book visit');
      setSaving(false);
      return;
    }
    const { id } = await res.json();
    router.push(`/consultancy/clients/${clientId}/visits/${id}`);
  }

  return (
    <main className="portal-page flex-1 space-y-4">
      <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Book a visit — {clientName}</h1>
      <form onSubmit={submit} className="card p-4 space-y-3" style={{ maxWidth: 480 }}>
        <div className="form-group">
          <label className="label">Visit type</label>
          <select className="input" value={visitType} onChange={e => setVisitType(e.target.value)}>
            {VISIT_TYPES.map(t => <option key={t} value={t}>{VISIT_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Date</label>
          <input type="date" className="input" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="label">Template (optional)</label>
          <select className="input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
            <option value="">No template</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({VISIT_TEMPLATE_CATEGORY_LABELS[t.category]})</option>)}
          </select>
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
        <button type="submit" disabled={saving} className="btn-cta">
          {saving && <Loader2 size={14} className="animate-spin" />} {saving ? 'Booking…' : 'Book visit'}
        </button>
      </form>
    </main>
  );
}
