import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { portalUrl } from '@/lib/portalUrl';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';
import RiskGraphClient from '@/components/hs/RiskGraphClient';

export const metadata: Metadata = { title: 'Risk Graph' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 8, Group 3. Reads the real structural relationships
// (risk_assessment_items.hazard_id, risk_item_controls) plus hs_links
// for legal obligations, computes Connected Compliance Intelligence
// (Group 2, pure/no-AI/read-time), and renders both the intelligence
// dashboard and a "explore connections" panel over the risk_graph_
// neighbors() function Group 1 built. Hazards and risk assessments have
// no admin-side per-record page of their own (they are managed only
// through the portal's PROTECT workspace, staff included, per 122's
// own "staff may work in the client workspace exactly as a consultant
// does" design) — this page links out to the portal for those, and
// internally for legal obligations, which DO have an admin tab.
export default async function RiskGraphPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [hazards, riskAssessments, raItems, controlLinks, obligations] = await Promise.all([
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('hazards').select('id, title, status').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('risk_assessments').select('id, title, status').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string; hazard_id: string | null }>((from, to) =>
      supabase.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; control_title: string; effectiveness: string }>((from, to) =>
      supabase.from('risk_item_controls').select('id, risk_assessment_item_id, control_id, control_title, effectiveness').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<{ id: string; legal_requirement_id: string; applicability_status: string }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('id, legal_requirement_id, applicability_status').eq('company_id', params.companyId).order('id').range(from, to)),
  ]);

  const requirementIds = [...new Set(obligations.rows.map(o => o.legal_requirement_id))];
  const [{ data: requirements }, legalLinksA, legalLinksB] = await Promise.all([
    requirementIds.length > 0
      ? supabase.from('legal_requirements').select('id, title').in('id', requirementIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    readAllPages<RiskGraphLink>((from, to) =>
      supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', params.companyId).eq('from_type', 'legal_obligation').order('id').range(from, to)),
    readAllPages<RiskGraphLink>((from, to) =>
      supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', params.companyId).eq('to_type', 'legal_obligation').order('id').range(from, to)),
  ]);

  const titleByRequirement = new Map((requirements ?? []).map(r => [r.id, r.title]));
  const legalObligations = obligations.rows.map(o => ({
    id: o.id,
    title: titleByRequirement.get(o.legal_requirement_id) ?? 'Untitled requirement',
    applicability_status: o.applicability_status,
  }));
  const legalObligationLinks: RiskGraphLink[] = [...legalLinksA.rows, ...legalLinksB.rows];

  const intelligence = computeRiskGraphIntelligence({
    hazards: hazards.rows,
    riskAssessments: riskAssessments.rows,
    riskAssessmentItems: raItems.rows,
    controlLinks: controlLinks.rows,
    legalObligations,
    legalObligationLinks,
  });

  const exploreOptions = [
    ...hazards.rows.map(h => ({ type: 'hazard' as const, id: h.id, label: `Hazard: ${h.title}` })),
    ...riskAssessments.rows.map(r => ({ type: 'risk_assessment' as const, id: r.id, label: `Risk assessment: ${r.title}` })),
    ...legalObligations.map(o => ({ type: 'legal_obligation' as const, id: o.id, label: `Legal obligation: ${o.title}` })),
  ];

  return (
    <RiskGraphClient companyId={params.companyId} intelligence={intelligence} exploreOptions={exploreOptions} role="admin" portalBase={portalUrl()} />
  );
}
