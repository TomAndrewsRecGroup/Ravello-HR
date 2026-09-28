'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadEvidence } from '@/lib/hs/evidence';
import { RISK_LEVELS, RISK_LEVEL_LABELS, hazardPath, type RiskLevel } from '@/lib/hs/safetyVocab';

// Quick hazard report — built for a phone on a site walk: five fields,
// big targets, the camera one tap away. The reporter does not assess
// anything; the report lands as "identified" for H&S review (the 123
// guard forces that for anyone without hazard.manage).
export default function HazardReportForm({ companyId, sites, categories }: {
  companyId: string; sites: { id: string; name: string }[]; categories: { id: string; name: string }[];
}) {
  const [title, setTitle] = useState('');
  const [observed, setObserved] = useState('');
  const [siteId, setSiteId] = useState(sites.length === 1 ? sites[0].id : '');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [seriousness, setSeriousness] = useState<RiskLevel | ''>('');
  const [immediate, setImmediate] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; reference: string; photoProblem: string | null } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const sb = createClient();
    const { data, error: err } = await sb.from('hazards').insert({
      company_id: companyId, title: title.trim(), description: observed.trim() || null,
      site_id: siteId || null, linked_location: location.trim() || null, hazard_category_id: category || null,
      perceived_seriousness: seriousness || null, immediate_action_taken: immediate.trim() || null,
    }).select('id, reference').single();
    if (err || !data) { setBusy(false); setError(err?.message ?? 'The hazard was not saved.'); return; }
    const photoProblem = photo ? await uploadEvidence(sb, { companyId, entityType: 'hazard', entityId: data.id, file: photo, evidenceType: 'photo' }) : null;
    setBusy(false);
    setDone({ id: data.id, reference: data.reference, photoProblem });
  }

  if (done) {
    return (
      <div className="card p-6 max-w-xl space-y-3">
        <p className="flex items-center gap-2 text-lg font-semibold" style={{ color: 'var(--teal)' }}>
          <CheckCircle2 size={22} /> Hazard {done.reference} reported
        </p>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Thank you. The H&amp;S team has been told and will review it.</p>
        {done.photoProblem && <p className="text-sm" style={{ color: 'var(--red)' }}>The photo was not attached: {done.photoProblem}</p>}
        <div className="flex flex-wrap gap-2">
          <Link href={hazardPath(done.id)} className="btn-secondary">View the report</Link>
          <button className="btn-ghost" onClick={() => { setDone(null); setTitle(''); setObserved(''); setImmediate(''); setPhoto(null); setSeriousness(''); }}>Report another</button>
        </div>
      </div>
    );
  }

  const needLocation = !siteId && !location.trim();
  return (
    <form onSubmit={submit} className="card p-4 sm:p-6 max-w-xl space-y-4">
      <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>Report a hazard</h2>
      <label className="block">
        <span className="label">What is the hazard?</span>
        <input className="input" style={{ minHeight: 44 }} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required
          placeholder="e.g. Trailing cable across walkway" />
      </label>
      <label className="block">
        <span className="label">What did you see?</span>
        <textarea className="input" rows={3} value={observed} onChange={e => setObserved(e.target.value)} maxLength={4000} />
      </label>
      {sites.length > 0 && (
        <label className="block">
          <span className="label">Site</span>
          <select className="input" style={{ minHeight: 44 }} value={siteId} onChange={e => setSiteId(e.target.value)}>
            <option value="">Not listed / other location</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Exact location{siteId ? ' (optional)' : ''}</span>
        <input className="input" style={{ minHeight: 44 }} value={location} onChange={e => setLocation(e.target.value)} maxLength={300}
          placeholder="e.g. Goods-in, bay 3" required={!siteId} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">How serious does it look?</span>
          <select className="input" style={{ minHeight: 44 }} value={seriousness} onChange={e => setSeriousness(e.target.value as RiskLevel | '')}>
            <option value="">Not sure</option>
            {RISK_LEVELS.map(l => <option key={l} value={l}>{RISK_LEVEL_LABELS[l]}</option>)}
          </select>
        </label>
        {categories.length > 0 && (
          <label className="block">
            <span className="label">Type (optional)</span>
            <select className="input" style={{ minHeight: 44 }} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Not sure</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <label className="block">
        <span className="label">Anything done straight away? (optional)</span>
        <input className="input" style={{ minHeight: 44 }} value={immediate} onChange={e => setImmediate(e.target.value)} maxLength={2000}
          placeholder="e.g. Coned off and told the supervisor" />
      </label>
      <label className="btn-secondary cursor-pointer w-full justify-center" style={{ minHeight: 48 }}>
        <Camera size={16} /> {photo ? `Photo: ${photo.name}` : 'Add a photo (optional)'}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <button className="btn-cta w-full justify-center" style={{ minHeight: 48 }} disabled={busy || !title.trim() || needLocation}>
        {busy && <Loader2 size={16} className="animate-spin" />} Report hazard
      </button>
    </form>
  );
}
