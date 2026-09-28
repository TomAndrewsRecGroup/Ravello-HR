'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { HAZARD_STATUSES, HAZARD_STATUS_LABELS, type HazardStatus } from '@/lib/hs/safetyVocab';

interface Hazard { id: string; status: HazardStatus; owner_id: string | null; hazard_category_id: string | null; site_id: string | null;
  department_id: string | null; notes: string | null; row_version: number }

// H&S review of a hazard (hazard.manage). The save is conditional on
// the row_version the page was rendered with, so two people reviewing
// the same hazard cannot silently overwrite each other.
export default function HazardManage({ hazard, people, sites, departments, categories }: {
  hazard: Hazard;
  people: { user_id: string; full_name: string }[];
  sites: { id: string; name: string }[];
  departments: { id: string; name: string; site_id: string | null }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [f, setF] = useState(hazard);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Hazard>(k: K, v: Hazard[K]) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true); setMsg(null);
    const res = await createClient().from('hazards').update({
      status: f.status, owner_id: f.owner_id, hazard_category_id: f.hazard_category_id, site_id: f.site_id,
      department_id: f.department_id, notes: f.notes?.trim() || null,
    }, COUNT_EXACT).eq('id', hazard.id).eq('row_version', hazard.row_version);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The hazard');
    if (!out.ok) {
      setMsg({ ok: false, text: res.count === 0 && !res.error ? 'Someone else changed this hazard since you opened it. Refresh to see their change.' : out.message! });
      return;
    }
    setMsg({ ok: true, text: 'Saved.' });
    router.refresh();
  }

  return (
    <section className="card p-5 space-y-3 no-print">
      <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>H&amp;S review</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block"><span className="label">Status</span>
          <select className="input" value={f.status} onChange={e => set('status', e.target.value as HazardStatus)}>
            {HAZARD_STATUSES.map(s => <option key={s} value={s}>{HAZARD_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Owner</span>
          <select className="input" value={f.owner_id ?? ''} onChange={e => set('owner_id', e.target.value || null)}>
            <option value="">Unassigned</option>
            {people.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Category</span>
          <select className="input" value={f.hazard_category_id ?? ''} onChange={e => set('hazard_category_id', e.target.value || null)}>
            <option value="">Not set</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Site</span>
          <select className="input" value={f.site_id ?? ''} onChange={e => set('site_id', e.target.value || null)}>
            <option value="">Not set</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Department / area</span>
          <select className="input" value={f.department_id ?? ''} onChange={e => set('department_id', e.target.value || null)}>
            <option value="">Not set</option>
            {departments.filter(d => !f.site_id || !d.site_id || d.site_id === f.site_id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>
      <label className="block"><span className="label">Review notes</span>
        <textarea className="input" rows={3} value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} maxLength={4000} />
      </label>
      {f.status === 'closed' && (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Close a hazard only when it no longer exists. A hazard that is inherent to the work but controlled is &quot;Controlled&quot; or &quot;Monitoring&quot;.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button className="btn-cta btn-sm" onClick={save} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Save review</button>
        {msg && <span className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</span>}
      </div>
    </section>
  );
}
