'use client';
import { useState } from 'react';
import { Camera, CheckCircle2, Loader2 } from 'lucide-react';
import { HS_INCIDENT_TYPES, HS_INCIDENT_TYPE_LABELS, type HsIncidentType } from '@/lib/hs/vocab';

const BIG = { minHeight: 44 } as const;

// The QR-scan equivalent of the portal's own IncidentReportForm.tsx,
// trimmed to what a phone screen with no login needs: what kind (for
// an incident only), a title, what happened, an optional location
// (required only when the badge carries no site of its own), and
// optional photos — uploaded AFTER the report saves, via
// /api/w/[token]/evidence, so a photo failure never loses the report.
export default function ReportForm({
  token, kind, hasSite, onDone,
}: {
  token: string;
  kind: 'incident' | 'hazard';
  hasSite: boolean;
  onDone: () => void;
}) {
  const [incidentType, setIncidentType] = useState<HsIncidentType | ''>('');
  const [title, setTitle] = useState('');
  const [what, setWhat] = useState('');
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; problems: string[] } | null>(null);

  const needLocation = !hasSite && !location.trim();
  const ready = title.trim() && what.trim() && !needLocation && (kind === 'hazard' || incidentType);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);

    const endpoint = kind === 'incident' ? 'report-incident' : 'report-hazard';
    const res = await fetch(`/api/w/${encodeURIComponent(token)}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(kind === 'incident' ? { incident_type: incidentType } : {}),
        title: title.trim(), description: what.trim(), location: location.trim(),
      }),
    });
    const body = await res.json().catch(() => ({ error: 'Something went wrong.' }));
    if (!res.ok) { setBusy(false); setError(body.error ?? 'Something went wrong.'); return; }

    const problems: string[] = [];
    for (const file of photos) {
      const form = new FormData();
      form.set('entity_type', kind);
      form.set('entity_id', body.id);
      form.set('file', file);
      const upRes = await fetch(`/api/w/${encodeURIComponent(token)}/evidence`, { method: 'POST', body: form });
      if (!upRes.ok) {
        const upBody = await upRes.json().catch(() => ({}));
        problems.push(upBody.error ?? `${file.name} could not be uploaded.`);
      }
    }

    setBusy(false);
    setDone({ ref: body.number ?? body.reference ?? '', problems });
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: 'var(--teal)' }}>
          <CheckCircle2 size={18} /> Reported{done.ref ? ` — ${done.ref}` : ''}
        </p>
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Thank you. This has been sent to the H&amp;S team.</p>
        {done.problems.map((p, i) => <p key={i} className="text-xs" style={{ color: 'var(--red)' }}>{p}</p>)}
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {kind === 'incident' && (
        <label className="block">
          <span className="label">What kind of event?</span>
          <select className="input" style={BIG} value={incidentType} onChange={e => setIncidentType(e.target.value as HsIncidentType)} required>
            <option value="">Choose…</option>
            {HS_INCIDENT_TYPES.map(t => <option key={t} value={t}>{HS_INCIDENT_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Short title</span>
        <input className="input" style={BIG} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required
          placeholder={kind === 'incident' ? 'e.g. Slip on wet floor' : 'e.g. Trailing cable in walkway'} />
      </label>
      <label className="block">
        <span className="label">What happened{kind === 'hazard' ? ' / what did you see' : ''}?</span>
        <textarea className="input" rows={3} value={what} onChange={e => setWhat(e.target.value)} maxLength={4000} required />
      </label>
      {!hasSite && (
        <label className="block">
          <span className="label">Where is this?</span>
          <input className="input" style={BIG} value={location} onChange={e => setLocation(e.target.value)} maxLength={300} required
            placeholder="e.g. Warehouse, loading bay 2" />
        </label>
      )}
      <label className="btn-secondary cursor-pointer w-full justify-center" style={{ minHeight: 44 }}>
        <Camera size={16} /> {photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} added` : 'Add a photo (optional)'}
        <input type="file" accept="image/*" capture="environment" multiple className="sr-only"
          onChange={e => { const l = e.target.files; if (l) setPhotos(p => [...p, ...Array.from(l)]); e.target.value = ''; }} />
      </label>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" style={BIG} onClick={onDone}>Cancel</button>
        <button className="btn-cta flex-1" style={BIG} disabled={busy || !ready}>
          {busy && <Loader2 size={16} className="animate-spin" />} Send
        </button>
      </div>
    </form>
  );
}
