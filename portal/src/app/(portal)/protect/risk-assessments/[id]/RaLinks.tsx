'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { hazardPath, incidentPath, humanise } from '@/lib/hs/safetyVocab';

interface LinkRow { id: string; type: string; targetId: string; relation: string; label: string; href: string }
interface Option { id: string; label: string }

// Hazards and incidents related to this assessment. Three sources, all
// shown: typed hs_links (122 — the database checks both ends are this
// organisation's), hazards named on the risk items, and incidents whose
// report points at this assessment. Linking never changes the
// assessment itself; an approved version is only ever revised by a
// person creating a new version.
export default function RaLinks({ raId, companyId, canEdit, links, itemHazards, incidentsPointingHere, hazardOptions, incidentOptions }: {
  raId: string; companyId: string; canEdit: boolean;
  links: LinkRow[]; itemHazards: Option[]; incidentsPointingHere: Option[];
  hazardOptions: Option[]; incidentOptions: Option[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<'hazard' | 'incident'>('hazard');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uniqueHazards = itemHazards.filter((h, i, a) => a.findIndex(x => x.id === h.id) === i);
  const options = (type === 'hazard' ? hazardOptions : incidentOptions)
    .filter(o => !links.some(l => l.type === type && l.targetId === o.id));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true); setError(null);
    const { error: err } = await createClient().from('hs_links').insert({
      company_id: companyId, from_type: 'risk_assessment', from_id: raId, to_type: type, to_id: target, relation: 'related',
    });
    setBusy(false);
    if (err) { setError(err.code === '23505' ? 'Those records are already linked.' : err.message); return; }
    setAdding(false); setTarget('');
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true); setError(null);
    const res = await createClient().from('hs_links').delete(COUNT_EXACT).eq('id', id);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The link');
    if (!out.ok) { setError(out.message); return; }
    router.refresh();
  }

  const empty = links.length === 0 && uniqueHazards.length === 0 && incidentsPointingHere.length === 0;

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Linked hazards and incidents</h2>
        {canEdit && !adding && (
          <button className="btn-secondary btn-sm ml-auto no-print" onClick={() => setAdding(true)}><Plus size={14} /> Link a record</button>
        )}
      </div>
      {empty && <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No hazards or incidents are linked to this assessment.</p>}

      {uniqueHazards.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Hazards assessed here</p>
          <ul className="text-sm space-y-1">{uniqueHazards.map(h => <li key={h.id}><Link href={hazardPath(h.id)}>{h.label}</Link></li>)}</ul>
        </div>
      )}
      {incidentsPointingHere.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Incidents reported against this assessment</p>
          <ul className="text-sm space-y-1">{incidentsPointingHere.map(i => <li key={i.id}><Link href={incidentPath(i.id)}>{i.label}</Link></li>)}</ul>
        </div>
      )}
      {links.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--ink-faint)' }}>Other links</p>
          <ul className="text-sm space-y-1">
            {links.map(l => (
              <li key={l.id} className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{humanise(l.type)}</span>
                <Link href={l.href}>{l.label}</Link>
                {l.relation !== 'related' && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>({humanise(l.relation)})</span>}
                {canEdit && <button className="btn-icon no-print" aria-label="Remove link" disabled={busy} onClick={() => remove(l.id)}><X size={14} /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 no-print">
          <label className="block"><span className="label">Record type</span>
            <select className="input" value={type} onChange={e => { setType(e.target.value as 'hazard' | 'incident'); setTarget(''); }}>
              <option value="hazard">Hazard</option><option value="incident">Incident</option>
            </select></label>
          <label className="block flex-1 min-w-[220px]"><span className="label">Record</span>
            <select className="input" value={target} onChange={e => setTarget(e.target.value)} required>
              <option value="">Choose…</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select></label>
          <button className="btn-cta btn-sm" disabled={busy || !target}>{busy && <Loader2 size={14} className="animate-spin" />} Link</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </section>
  );
}
