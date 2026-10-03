'use client';

import { useEffect, useState } from 'react';
import { Loader2, Network, Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { humanise } from '@/lib/hs/safetyVocab';
import { resolveEntityLabels, hrefForEntity } from '@/lib/riskGraph/entityLabels';

// Core-OS 360 Phase 23, Group 1 (closes C8.3 — "Reusable Connections
// panel on relevant record pages"). RaLinks.tsx/IncidentLinks.tsx/
// RamsCoshhLinks.tsx are bespoke, hand-typed panels covering only two
// link types each (hazard/incident) — genuinely useful, and left
// exactly as they are. This is the GENERIC version: any entity type,
// any record, additive alongside a bespoke panel where one already
// exists (portal's incident detail page keeps IncidentLinks.tsx for
// hazard/RA links and gains this ALONGSIDE it for every other kind of
// connection — a contractor, a permit, an action).
//
// Queries hs_links DIRECTLY at depth 1 (never the multi-hop
// risk_graph_neighbors() RPC, which does not return the underlying
// hs_links row id — a per-record panel needs that id to support
// removal, the same reason RaLinks.tsx already queries hs_links
// directly rather than the RPC). "Add a connection" is a plain-paste
// target id, the established EvidenceLinksPanel.tsx/
// LessonsLearnedClient.tsx precedent for a generic link tool with no
// per-type options list to fetch.
const LINKABLE_TYPES = [
  'hazard', 'risk_assessment', 'method_statement', 'coshh_assessment', 'substance',
  'incident', 'action', 'audit', 'document', 'equipment', 'contractor', 'permit',
  'objective', 'milestone', 'environmental_aspect', 'legal_obligation', 'emergency_plan',
] as const;

interface LinkRow { id: string; from_type: string; from_id: string; to_type: string; to_id: string; relation: string }
interface ConnectionRow { linkId: string; entityType: string; entityId: string; relation: string; label: string; href: string | null }

export default function ConnectionsPanel({ entityType, entityId, companyId, canEdit, role, portalBase }: {
  entityType: string; entityId: string; companyId: string; canEdit: boolean;
  role: 'admin' | 'portal'; portalBase?: string;
}) {
  const [connections, setConnections] = useState<ConnectionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<string>(LINKABLE_TYPES[0]);
  const [addId, setAddId] = useState('');
  const [addRelation, setAddRelation] = useState('related');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setError('');
    const supabase = createClient();
    const { data, error: err } = await supabase.from('hs_links')
      .select('id, from_type, from_id, to_type, to_id, relation')
      .or(`and(from_type.eq.${entityType},from_id.eq.${entityId}),and(to_type.eq.${entityType},to_id.eq.${entityId})`);
    if (err) { setLoading(false); setError(err.message); return; }
    const rows = (data ?? []) as LinkRow[];
    const others = rows.map(r => {
      const self = r.from_type === entityType && r.from_id === entityId;
      return { entityType: self ? r.to_type : r.from_type, entityId: self ? r.to_id : r.from_id, linkId: r.id, relation: r.relation };
    });
    const labels = await resolveEntityLabels(supabase, others.map(o => ({ entity_type: o.entityType, entity_id: o.entityId })));
    setConnections(others.map(o => ({
      linkId: o.linkId, entityType: o.entityType, entityId: o.entityId, relation: o.relation,
      label: labels.get(`${o.entityType}:${o.entityId}`) ?? `${humanise(o.entityType)} ${o.entityId.slice(0, 8)}…`,
      href: hrefForEntity(o.entityType, o.entityId, { role, companyId, portalBase }),
    })));
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entityType, entityId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!addId.trim()) return;
    setBusy(true); setError('');
    const { error: err } = await createClient().from('hs_links').insert({
      company_id: companyId, from_type: entityType, from_id: entityId,
      to_type: addType, to_id: addId.trim(), relation: addRelation.trim() || 'related',
    });
    setBusy(false);
    if (err) { setError(err.code === '23505' ? 'Those records are already linked.' : err.message); return; }
    setAdding(false); setAddId(''); setAddRelation('related');
    load();
  }

  async function remove(linkId: string) {
    setBusy(true); setError('');
    const res = await createClient().from('hs_links').delete(COUNT_EXACT).eq('id', linkId);
    setBusy(false);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The connection');
    if (!out.ok) { setError(out.message ?? ''); return; }
    load();
  }

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Network size={16} style={{ color: 'var(--blue)' }} />
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Connections</h2>
        {canEdit && !adding && (
          <button className="btn-secondary btn-sm ml-auto no-print" onClick={() => setAdding(true)}><Plus size={14} /> Link a record</button>
        )}
      </div>

      {loading && <p className="text-sm flex items-center gap-2" style={{ color: 'var(--ink-faint)' }}><Loader2 size={14} className="animate-spin" /> Loading…</p>}
      {!loading && connections && connections.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No connected records.</p>
      )}
      {!loading && connections && connections.length > 0 && (
        <ul className="text-sm space-y-1">
          {connections.map(c => (
            <li key={c.linkId} className="flex items-center gap-2">
              <span className="badge">{humanise(c.entityType)}</span>
              {c.href ? <a href={c.href} target={role === 'admin' ? '_blank' : undefined} rel={role === 'admin' ? 'noreferrer' : undefined} style={{ color: 'var(--purple)' }}>{c.label}</a>
                       : <span style={{ color: 'var(--ink-soft)' }}>{c.label}</span>}
              {c.relation !== 'related' && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>({humanise(c.relation)})</span>}
              {canEdit && <button className="btn-icon no-print" aria-label="Remove connection" disabled={busy} onClick={() => remove(c.linkId)}><X size={14} /></button>}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 no-print">
          <label className="block"><span className="label">Record type</span>
            <select className="input" value={addType} onChange={e => setAddType(e.target.value)}>
              {LINKABLE_TYPES.map(t => <option key={t} value={t}>{humanise(t)}</option>)}
            </select></label>
          <label className="block flex-1 min-w-[220px]"><span className="label">Record id</span>
            <input className="input" value={addId} onChange={e => setAddId(e.target.value)} placeholder="Paste the record's id" required /></label>
          <label className="block"><span className="label">Relation</span>
            <input className="input" value={addRelation} onChange={e => setAddRelation(e.target.value)} placeholder="related" /></label>
          <button className="btn-cta btn-sm" disabled={busy || !addId.trim()}>{busy && <Loader2 size={14} className="animate-spin" />} Link</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </section>
  );
}
