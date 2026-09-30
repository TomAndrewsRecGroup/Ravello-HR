'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldAlert, Scale, Network, Loader2, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hrefForEntity } from '@/lib/riskGraph/entityLabels';
import type { RiskGraphIntelligence } from '@/lib/riskGraph/intelligence';

interface ExploreOption { type: 'hazard' | 'risk_assessment' | 'legal_obligation'; id: string; label: string }
interface Neighbour { entity_type: string; entity_id: string; relation: string | null; hop: number; direction: string }

// Core-OS 360 Phase 8, Group 3, widened in Phase 23 Group 2 (closes
// gap-ledger row C8.5) into a shared-dupe pair — the exact
// ComplianceTwinView.tsx/AssuranceTodayView.tsx precedent: an
// identical already-assembled snapshot, only per-link routing differs
// by caller. `role`/`portalBase` are explicit params (never an
// imported app-specific helper like portalUrl()) so this file stays
// byte-identical across both apps; hrefForEntity() (entityLabels.ts,
// Phase 23 Group 1) does the actual per-type/per-role routing that
// used to be hardcoded here.
//
// Two halves on one page: the Connected Compliance Intelligence
// dashboard (Group 2's pure function, computed server-side and passed
// in as a prop — never recomputed here) and an "explore connections"
// panel over risk_graph_neighbors() (Group 1), called directly under
// the signed-in session (SECURITY INVOKER — the same reason
// GlobalSearch.tsx calls search_records() the same way). Migration 187
// (Phase 23 Group 2) is what makes this portfolio-safe for a
// consultant session with no code change here at all.
//
// The explorer's starting point is limited to entities this page
// already has a label for (hazards, risk assessments, legal
// obligations loaded server-side) — picking an arbitrary id by hand
// would be poor UX and error-prone. A NEIGHBOUR beyond that set shows
// only its type and a truncated id, never a fabricated label — this is
// a known, disclosed scope limit (docs/CORE_OS_360_PHASE8_PLAN.md),
// not an oversight: labelling every one of the ~35 hs_entity_table()
// branches would need a query per branch, real scope for a later pass
// if this proves worth extending.
export default function RiskGraphClient({ companyId, intelligence, exploreOptions, role, portalBase = '' }: {
  companyId: string; intelligence: RiskGraphIntelligence; exploreOptions: ExploreOption[];
  role: 'admin' | 'portal'; portalBase?: string;
}) {
  const [selected, setSelected] = useState<ExploreOption | null>(null);
  const [depth, setDepth] = useState(2);
  const [loading, setLoading] = useState(false);
  const [neighbours, setNeighbours] = useState<Neighbour[] | null>(null);
  const [error, setError] = useState('');

  async function explore() {
    if (!selected) return;
    setLoading(true); setError(''); setNeighbours(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc('risk_graph_neighbors', {
      p_type: selected.type, p_id: selected.id, p_depth: depth,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setNeighbours((data ?? []) as Neighbour[]);
  }

  const empty = intelligence.uncoveredHazards.length === 0
    && intelligence.ineffectiveSharedControls.length === 0
    && intelligence.assessmentsWithIneffectiveControls.length === 0
    && intelligence.unlinkedApplicableObligations.length === 0;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Insights only visible from the CONNECTIONS between records — never a single record on its own. Computed live from
          the register, never stored, never scored.
        </p>
      </div>

      {empty && (
        <div className="card empty-state p-10">
          <p style={{ color: 'var(--ink-faint)' }}>No connected-compliance gaps found for this client.</p>
        </div>
      )}

      {intelligence.uncoveredHazards.length > 0 && (
        <section className="card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} style={{ color: 'var(--gold)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Hazards with no risk assessment ({intelligence.uncoveredHazards.length})</h2>
          </div>
          <ul className="text-sm space-y-1">
            {intelligence.uncoveredHazards.map(h => {
              const href = hrefForEntity('hazard', h.id, { role, companyId, portalBase });
              const external = role === 'admin';
              return (
                <li key={h.id}>
                  {href ? (
                    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="inline-flex items-center gap-1" style={{ color: 'var(--purple)' }}>
                      {h.title} {external && <ExternalLink size={12} />}
                    </a>
                  ) : h.title}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {intelligence.ineffectiveSharedControls.length > 0 && (
        <section className="card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} style={{ color: 'var(--red)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Shared controls recorded ineffective ({intelligence.ineffectiveSharedControls.length})</h2>
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>A control relied on by two or more risk assessments whose own recorded effectiveness says it is not working — every assessment that names it is affected.</p>
          <ul className="text-sm space-y-1">
            {intelligence.ineffectiveSharedControls.map(c => (
              <li key={c.controlId}>
                <strong>{c.controlTitle}</strong> — relied on by {c.assessmentCount} assessments, recorded <span style={{ color: 'var(--red)' }}>{c.effectiveness.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {intelligence.assessmentsWithIneffectiveControls.length > 0 && (
        <section className="card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} style={{ color: 'var(--red)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Active assessments carrying an ineffective control ({intelligence.assessmentsWithIneffectiveControls.length})</h2>
          </div>
          <ul className="text-sm space-y-1">
            {intelligence.assessmentsWithIneffectiveControls.map(a => {
              const href = hrefForEntity('risk_assessment', a.riskAssessmentId, { role, companyId, portalBase });
              const external = role === 'admin';
              return (
                <li key={a.riskAssessmentId}>
                  {href ? (
                    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="inline-flex items-center gap-1" style={{ color: 'var(--purple)' }}>
                      {a.title} {external && <ExternalLink size={12} />}
                    </a>
                  ) : a.title}
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}> — {a.ineffectiveControlTitles.join(', ')}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {intelligence.unlinkedApplicableObligations.length > 0 && (
        <section className="card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Scale size={18} style={{ color: 'var(--gold)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Applicable legal obligations with no linked risk assessment ({intelligence.unlinkedApplicableObligations.length})</h2>
          </div>
          <ul className="text-sm space-y-1">
            {intelligence.unlinkedApplicableObligations.map(o => {
              const href = hrefForEntity('legal_obligation', o.id, { role, companyId, portalBase });
              return (
                <li key={o.id}>
                  {href ? <a href={href} style={{ color: 'var(--purple)' }}>{o.title}</a> : o.title}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Network size={18} style={{ color: 'var(--blue)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Explore connections</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[240px]">
            <span className="label">Starting record</span>
            <select className="input" value={selected ? `${selected.type}:${selected.id}` : ''} onChange={e => {
              const [type, id] = e.target.value.split(':');
              setSelected(exploreOptions.find(o => o.type === type && o.id === id) ?? null);
              setNeighbours(null);
            }}>
              <option value="">Choose a record…</option>
              {exploreOptions.map(o => <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Depth</span>
            <select className="input" value={depth} onChange={e => setDepth(Number(e.target.value))}>
              <option value={1}>1 hop</option>
              <option value={2}>2 hops</option>
              <option value={3}>3 hops</option>
            </select>
          </label>
          <button type="button" className="btn-cta btn-sm" disabled={!selected || loading} onClick={explore}>
            {loading && <Loader2 size={14} className="animate-spin" />} Explore
          </button>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
        {neighbours && (
          neighbours.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No connected records within {depth} hop{depth === 1 ? '' : 's'}.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {neighbours.map(n => (
                <li key={`${n.entity_type}:${n.entity_id}`} className="flex items-center gap-2">
                  <span className="badge">{n.entity_type.replace(/_/g, ' ')}</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>{n.entity_id.slice(0, 8)}…</span>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {n.hop} hop{n.hop === 1 ? '' : 's'}, {n.direction}{n.relation ? ` (${n.relation})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  );
}
