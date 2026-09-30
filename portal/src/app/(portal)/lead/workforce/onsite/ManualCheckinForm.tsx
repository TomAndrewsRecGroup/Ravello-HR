'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Core-OS 360 Completion Programme, Phase 26, Group 2 (C14.7). A worker
// with no badge, a lost badge, or a site running a staffed kiosk has no
// way onto the roster through /w/[token] alone — this is the manual
// alternative. Site selection is EXPLICIT and required, never a
// guessed default: migration 195's own RLS policy and the new
// site_checkins_manual_guard() trigger are the real gate (own company,
// workforce.manage, recorded_via forced to 'manual'); this form is a
// convenience over them, not a second copy of the rule.
export default function ManualCheckinForm({
  people, sites,
}: {
  people: { id: string; full_name: string }[];
  sites: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [personId, setPersonId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!personId || !siteId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from('site_checkins').insert({
        person_id: personId,
        site_id: siteId,
        recorded_via: 'manual',
      });
      if (insertError) {
        setError(insertError.code === '23505' ? 'That person is already checked in somewhere.' : insertError.message);
        return;
      }
      setPersonId('');
      setSiteId('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        <UserPlus size={14} className="inline mr-1" /> Manual check-in
      </h2>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        For a worker with no badge, a lost badge, or a staffed kiosk. A site must be chosen explicitly.
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="label" htmlFor="manual-checkin-person">Person</label>
          <select id="manual-checkin-person" className="input" value={personId} onChange={e => setPersonId(e.target.value)} required>
            <option value="">Select a person…</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="manual-checkin-site">Site</label>
          <select id="manual-checkin-site" className="input" value={siteId} onChange={e => setSiteId(e.target.value)} required>
            <option value="">Select a site…</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-cta btn-sm" disabled={busy || !personId || !siteId}>
          {busy && <Loader2 size={14} className="animate-spin" />} Check in
        </button>
      </div>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </form>
  );
}
