import type { Metadata } from 'next';
import { AlertTriangle, ShieldAlert, Scale, Network } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { readAllPages } from '@/lib/supabase/paged';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';

export const metadata: Metadata = { title: 'Risk Graph' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 8, Group 3. Read-only — nothing here is
// self-certified, the standing PROTECT posture. Same pure
// computation as the admin page (lib/riskGraph/intelligence.ts,
// mirrored byte-identical). legal_requirements titles are read with
// the service role, scoped to exactly the ids this session's own
// RLS-protected read of organisation_legal_obligations already
// returned — the same pattern /protect/legal-register already uses.
// No graph explorer here (admin-only, Group 3's own scope note): a
// client reading their own connected-compliance gaps has no need to
// pick an arbitrary starting record and walk the graph by hand.
export default async function ProtectRiskGraphPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [hazards, riskAssessments, raItems, controlLinks, obligations] = await Promise.all([
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('hazards').select('id, title, status').eq('company_id', companyId).range(from, to)),
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('risk_assessments').select('id, title, status').eq('company_id', companyId).range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string; hazard_id: string | null }>((from, to) =>
      supabase.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id').eq('company_id', companyId).range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; control_title: string; effectiveness: string }>((from, to) =>
      supabase.from('risk_item_controls').select('risk_assessment_item_id, control_id, control_title, effectiveness').eq('company_id', companyId).range(from, to)),
    readAllPages<{ id: string; legal_requirement_id: string; applicability_status: string }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('id, legal_requirement_id, applicability_status').eq('company_id', companyId).range(from, to)),
  ]);

  const requirementIds = [...new Set(obligations.rows.map(o => o.legal_requirement_id))];
  let titleByRequirement = new Map<string, string>();
  if (requirementIds.length > 0) {
    const svc = createServiceSupabaseClient();
    const { data: requirements } = await svc.from('legal_requirements').select('id, title').in('id', requirementIds);
    titleByRequirement = new Map((requirements ?? []).map(r => [r.id, r.title]));
  }
  const legalObligations = obligations.rows.map(o => ({
    id: o.id,
    title: titleByRequirement.get(o.legal_requirement_id) ?? 'A legal requirement',
    applicability_status: o.applicability_status,
  }));

  const obligationIds = obligations.rows.map(o => o.id);
  let legalObligationLinks: RiskGraphLink[] = [];
  if (obligationIds.length > 0) {
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from('hs_links').select('from_type, from_id, to_type, to_id').eq('from_type', 'legal_obligation').in('from_id', obligationIds),
      supabase.from('hs_links').select('from_type, from_id, to_type, to_id').eq('to_type', 'legal_obligation').in('to_id', obligationIds),
    ]);
    legalObligationLinks = [...(a ?? []), ...(b ?? [])];
  }

  const intelligence = computeRiskGraphIntelligence({
    hazards: hazards.rows,
    riskAssessments: riskAssessments.rows,
    riskAssessmentItems: raItems.rows,
    controlLinks: controlLinks.rows,
    legalObligations,
    legalObligationLinks,
  });

  const empty = intelligence.uncoveredHazards.length === 0
    && intelligence.ineffectiveSharedControls.length === 0
    && intelligence.assessmentsWithIneffectiveControls.length === 0
    && intelligence.unlinkedApplicableObligations.length === 0;

  return (
    <main className="portal-page flex-1 space-y-4">
      <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Insights only visible from the CONNECTIONS between your records — never a single record on its own. Computed
        live from your register, never stored, never scored.
      </div>

      {empty && (
        <div className="card p-12"><div className="empty-state"><Network size={28} style={{ color: 'var(--blue)' }} /><p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>No connected-compliance gaps found right now</p></div></div>
      )}

      {intelligence.uncoveredHazards.length > 0 && (
        <section className="card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} style={{ color: 'var(--gold)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Hazards with no risk assessment ({intelligence.uncoveredHazards.length})</h2>
          </div>
          <ul className="text-sm space-y-1">
            {intelligence.uncoveredHazards.map(h => <li key={h.id}>{h.title}</li>)}
          </ul>
        </section>
      )}

      {intelligence.ineffectiveSharedControls.length > 0 && (
        <section className="card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} style={{ color: 'var(--red)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Shared controls recorded ineffective ({intelligence.ineffectiveSharedControls.length})</h2>
          </div>
          <ul className="text-sm space-y-1">
            {intelligence.ineffectiveSharedControls.map(c => (
              <li key={c.controlId}><strong>{c.controlTitle}</strong> — relied on by {c.assessmentCount} assessments, recorded <span style={{ color: 'var(--red)' }}>{c.effectiveness.replace('_', ' ')}</span></li>
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
            {intelligence.assessmentsWithIneffectiveControls.map(a => (
              <li key={a.riskAssessmentId}>{a.title} <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>— {a.ineffectiveControlTitles.join(', ')}</span></li>
            ))}
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
            {intelligence.unlinkedApplicableObligations.map(o => <li key={o.id}>{o.title}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
