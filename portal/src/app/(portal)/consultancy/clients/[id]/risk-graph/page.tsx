import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requirePortfolioSession, portfolioIncludes, createServiceSupabaseClient } from '@/lib/consultancy/portfolioAccess';
import { readAllPages } from '@/lib/supabase/paged';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';
import RiskGraphClient from '@/components/hs/RiskGraphClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Risk Graph — ${id.slice(0, 8)}` };
}

// Core-OS 360 Completion Programme, Phase 23, Group 2 (closes
// gap-ledger row C8.5 — "portfolio-safe consultant Risk Graph view").
// The exact Client 360 sub-page shape (168/Group 4): a service-role-
// scoped read for ONE authorised client, reachable without switching
// the active organisation. Migration 187's six new consultancy-read
// RLS policies are what make the "explore connections" panel below
// (calling risk_graph_neighbors() directly under the session) safe
// for a portfolio-wide consultant with zero code change of its own —
// this page's own reads use the service role (RLS cannot answer a
// cross-client question), but the explorer runs under the real
// session, which migration 187 now opens for exactly this client.
export default async function ConsultancyRiskGraphPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const portfolio = await requirePortfolioSession();
  if (!portfolio) redirect('/dashboard');
  if (!portfolioIncludes(portfolio.organisations, id)) notFound();

  const sb = createServiceSupabaseClient();

  const [hazards, riskAssessments, raItems, controlLinks, obligations] = await Promise.all([
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      sb.from('hazards').select('id, title, status').eq('company_id', id).order('id').range(from, to)),
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      sb.from('risk_assessments').select('id, title, status').eq('company_id', id).order('id').range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string; hazard_id: string | null }>((from, to) =>
      sb.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id').eq('company_id', id).order('id').range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; control_title: string; effectiveness: string }>((from, to) =>
      sb.from('risk_item_controls').select('id, risk_assessment_item_id, control_id, control_title, effectiveness').eq('company_id', id).order('id').range(from, to)),
    readAllPages<{ id: string; legal_requirement_id: string; applicability_status: string }>((from, to) =>
      sb.from('organisation_legal_obligations').select('id, legal_requirement_id, applicability_status').eq('company_id', id).order('id').range(from, to)),
  ]);

  const requirementIds = [...new Set(obligations.rows.map(o => o.legal_requirement_id))];
  const [{ data: requirements }, legalLinksA, legalLinksB] = await Promise.all([
    requirementIds.length > 0
      ? sb.from('legal_requirements').select('id, title').in('id', requirementIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    readAllPages<RiskGraphLink>((from, to) =>
      sb.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', id).eq('from_type', 'legal_obligation').order('id').range(from, to)),
    readAllPages<RiskGraphLink>((from, to) =>
      sb.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', id).eq('to_type', 'legal_obligation').order('id').range(from, to)),
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
    <main className="portal-page flex-1 space-y-4">
      <h1 className="text-xl font-display font-semibold" style={{ color: 'var(--ink)' }}>Risk Graph</h1>
      <RiskGraphClient companyId={id} intelligence={intelligence} exploreOptions={exploreOptions} role="portal" />
    </main>
  );
}
