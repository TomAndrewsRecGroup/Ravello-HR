import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '@/lib/supabase/paged';
import { loadPortfolioCountsForCompany } from '@/lib/boardAssurance/loadPortfolioCounts';
import { computeRiskGraphIntelligence, type RiskGraphLink } from '@/lib/riskGraph/intelligence';
import {
  assembleCore360Status,
  type Core360StatusSnapshot,
  type TrainingRecordExpiryRow,
  type EnvironmentalSpillStatusRow,
  type WasteMovementConformanceRow,
} from './assemble';

/**
 * Core-OS 360 Completion Programme, Phase 27, Group 4 (closes C13.8).
 * Admin-only (staff session reads only) — portal's own /protect/
 * core-360-status page keeps its own, separately-shaped version, the
 * same "two apps share no server code" reason loadComplianceTwinSnapshot/
 * loadPortfolioCounts are admin-only too.
 *
 * Composes three already-built pieces rather than inventing a fourth
 * read shape for any of them: loadPortfolioCountsForCompany() (Phase
 * 13) for People/Plant/Contractors, a Risk Graph read identical to
 * every other Risk Graph consumer in this codebase (loadComplianceTwinSnapshot,
 * the admin/portal risk-graph pages — duplicated per caller, the
 * established precedent, never re-exported from loadComplianceTwinSnapshot
 * since Risk Graph was never factored out of it), and the two small,
 * genuinely new reads assembleCore360Status() itself needs (training
 * expiry, open environmental spills / waste non-conformances).
 */
export async function loadCore360Status(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ snapshot: Core360StatusSnapshot; loadError: string | null }> {
  const { counts, loadError: countsError } = await loadPortfolioCountsForCompany(supabase, companyId);

  const [hazards, riskAssessments, raItems, controlLinks, obligationsRaw] = await Promise.all([
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('hazards').select('id, title, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('risk_assessments').select('id, title, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string; hazard_id: string | null }>((from, to) =>
      supabase.from('risk_assessment_items').select('id, risk_assessment_id, hazard_id').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; control_title: string; effectiveness: string }>((from, to) =>
      supabase.from('risk_item_controls').select('id, risk_assessment_item_id, control_id, control_title, effectiveness').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ id: string; legal_requirement_id: string; applicability_status: string }>((from, to) =>
      supabase.from('organisation_legal_obligations').select('id, legal_requirement_id, applicability_status').eq('company_id', companyId).order('id').range(from, to)),
  ]);

  const requirementIds = [...new Set(obligationsRaw.rows.map(o => o.legal_requirement_id))];
  const [{ data: requirements }, legalLinksA, legalLinksB] = await Promise.all([
    requirementIds.length > 0
      ? supabase.from('legal_requirements').select('id, title').in('id', requirementIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    readAllPages<RiskGraphLink>((from, to) =>
      supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', companyId).eq('from_type', 'legal_obligation').order('id').range(from, to)),
    readAllPages<RiskGraphLink>((from, to) =>
      supabase.from('hs_links').select('id, from_type, from_id, to_type, to_id')
        .eq('company_id', companyId).eq('to_type', 'legal_obligation').order('id').range(from, to)),
  ]);

  const titleByRequirement = new Map((requirements ?? []).map(r => [r.id, r.title]));
  const riskGraphLegalObligations = obligationsRaw.rows.map(o => ({
    id: o.id,
    title: titleByRequirement.get(o.legal_requirement_id) ?? 'Untitled requirement',
    applicability_status: o.applicability_status,
  }));
  const legalObligationLinks: RiskGraphLink[] = [...legalLinksA.rows, ...legalLinksB.rows];

  const riskGraph = computeRiskGraphIntelligence({
    hazards: hazards.rows,
    riskAssessments: riskAssessments.rows,
    riskAssessmentItems: raItems.rows,
    controlLinks: controlLinks.rows,
    legalObligations: riskGraphLegalObligations,
    legalObligationLinks,
  });

  const [trainingRows, spillRows, wasteRows] = await Promise.all([
    readAllPages<TrainingRecordExpiryRow>((from, to) =>
      supabase.from('training_records').select('id, expires_on').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<EnvironmentalSpillStatusRow>((from, to) =>
      supabase.from('environmental_spills').select('id, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<WasteMovementConformanceRow>((from, to) =>
      supabase.from('waste_movements').select('id, non_conformance').eq('company_id', companyId).order('id').range(from, to)),
  ]);

  const loadError =
    countsError ?? hazards.error ?? riskAssessments.error ?? raItems.error ?? controlLinks.error ??
    obligationsRaw.error ?? legalLinksA.error ?? legalLinksB.error ??
    trainingRows.error ?? spillRows.error ?? wasteRows.error ?? null;

  const snapshot = assembleCore360Status({
    portfolioCounts: counts,
    riskGraph,
    trainingRows: trainingRows.rows,
    environmentalSpills: spillRows.rows,
    wasteMovements: wasteRows.rows,
    today: new Date(),
  });

  return { snapshot, loadError };
}
