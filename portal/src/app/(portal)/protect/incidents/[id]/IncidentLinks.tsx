'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Link2, Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import type { Option } from './types';

export interface ResolvedLink { id: string; type: string; label: string; href: string | null }
export const LINK_TYPES: { type: string; label: string }[] = [
  { type: 'hazard', label: 'Hazard' }, { type: 'risk_assessment', label: 'Risk assessment' },
  { type: 'method_statement', label: 'RAMS / method statement' }, { type: 'coshh_assessment', label: 'COSHH assessment' },
  { type: 'equipment', label: 'Equipment' },
];

// Typed links from the incident to the records that should have
// controlled the work (hs_links, 122): RAMS, COSHH, hazards, further
// risk assessments and equipment. Linking never alters the linked
// record — an approved assessment is reviewed through an action, never
// edited from here.
export default function IncidentLinks({ incidentId, incidentNumber, companyId, siteId, links, options, canLink, canAssign, linkedRa }: {
  incidentId: string; incidentNumber: string; companyId: string; siteId: string | null; links: ResolvedLink[];
  options: Record<string, Option[]>; canLink: boolean; canAssign: boolean; linkedRa: { id: string; label: string } | null;
}) {
  const router = useRouter();
  const [type, setType] = useState('method_statement');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!to) return;
    setBusy('add'); setMsg(null);
    const { error } = await createClient().from('hs_links').insert({
      company_id: companyId, from_type: 'incident', from_id: incidentId, to_type: type, to_id: to, relation: 'related',
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.code === '23505' ? 'That record is already linked.' : error.message }); return; }
    setTo('');
    router.refresh();
  }

  async function remove(linkId: string) {
    setBusy(linkId); setMsg(null);
    const res = await createClient().from('hs_links').delete(COUNT_EXACT).eq('id', linkId);
    setBusy(null);
    const out = judgeWrite(res, 'The link');
    if (!out.ok) { setMsg({ ok: false, text: out.message! }); return; }
    router.refresh();
  }

  async function requestReview() {
    if (!linkedRa) return;
    setBusy('review'); setMsg(null);
    const { error } = await createClient().from('actions').insert({
      company_id: companyId, action_type: 'hs_corrective', priority: 'normal', status: 'active', source_type: 'incident', source_id: incidentId,
      site_id: siteId, action_class: 'preventive', title: `Review risk assessment ${linkedRa.label} following ${incidentNumber}`.slice(0, 200),
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'A review action has been raised. The assessment itself is unchanged until someone reviews it.' });
    router.refresh();
  }

  const opts = options[type] ?? [];
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--ink)' }}><Link2 size={14} /> Linked records</h3>
      {links.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No RAMS, COSHH, hazard or equipment records linked.</p> : (
        <ul className="text-sm space-y-1">
          {links.map(l => (
            <li key={l.id} className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{LINK_TYPES.find(t => t.type === l.type)?.label ?? l.type}</span>
              {l.href ? <Link href={l.href}>{l.label}</Link> : <span>{l.label}</span>}
              {canLink && <button className="btn-icon no-print" aria-label="Remove link" disabled={busy !== null} onClick={() => remove(l.id)}><Trash2 size={13} /></button>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 no-print">
        {canLink && (
          <form onSubmit={add} className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="label">Link a</span>
              <select className="input" value={type} onChange={e => { setType(e.target.value); setTo(''); }}>
                {LINK_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}</select></label>
            <label className="block min-w-[220px]"><span className="label">Record</span>
              <select className="input" value={to} onChange={e => setTo(e.target.value)}>
                <option value="">{opts.length ? 'Choose…' : 'None available'}</option>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <button className="btn-secondary btn-sm" disabled={!to || busy !== null}>{busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Link</button>
          </form>
        )}
        {canAssign && linkedRa && (
          <button className="btn-ghost btn-sm self-end" onClick={requestReview} disabled={busy !== null}>Request review of the risk assessment</button>
        )}
        <Link href="/protect/hazards/new" className="btn-ghost btn-sm self-end">Report a new hazard</Link>
      </div>
      {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--teal)' : 'var(--red)' }}>{msg.text}</p>}
    </div>
  );
}
