import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { portalUrl } from '@/lib/portalUrl';
import { computeCriticalControlVisibility, type CriticalControlCatalogueRow, type CriticalControlUseRow, type CriticalControlAssessmentRow } from '@/lib/criticalControls/compute';
import CriticalControlsView from '@/components/hs/CriticalControlsView';

export const metadata: Metadata = { title: 'Critical Controls' };
export const dynamic = 'force-dynamic';

// Critical Control Visibility (go-live gap list, item 4, 2026-10-02).
// A dedicated view over the same risk_item_controls rows lib/riskGraph/
// intelligence.ts already reads — never a second source of the same
// fact — filtered to controls.safety_critical (205). Hazards and risk
// assessments have no admin-side per-record page (the risk-graph
// page's own precedent); this links out to the portal for each use.
export default async function CriticalControlsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  // Fetched separately and joined in TS, never a chained embed — the
  // same "fetch by id list, never a chained embed" discipline the
  // risk-graph page's own reads already follow for this exact table.
  const [controls, riskItemControls, raItems, assessments] = await Promise.all([
    readAllPages<CriticalControlCatalogueRow>((from, to) =>
      supabase.from('controls').select('id, title, safety_critical, status').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; effectiveness: string }>((from, to) =>
      supabase.from('risk_item_controls').select('risk_assessment_item_id, control_id, effectiveness')
        .eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string }>((from, to) =>
      supabase.from('risk_assessment_items').select('id, risk_assessment_id').eq('company_id', params.companyId).order('id').range(from, to)),
    readAllPages<CriticalControlAssessmentRow>((from, to) =>
      supabase.from('risk_assessments').select('id, title, status').eq('company_id', params.companyId).order('id').range(from, to)),
  ]);

  const loadError = controls.error ?? riskItemControls.error ?? raItems.error ?? assessments.error ?? null;

  const raIdByItem = new Map(raItems.rows.map(i => [i.id, i.risk_assessment_id]));
  const useRows: CriticalControlUseRow[] = riskItemControls.rows
    .map(u => ({ ...u, risk_assessment_id: raIdByItem.get(u.risk_assessment_item_id) ?? '' }))
    .filter(u => u.risk_assessment_id);

  const statuses = computeCriticalControlVisibility(controls.rows, useRows, assessments.rows);

  return (
    <CriticalControlsView
      statuses={statuses}
      loadError={loadError}
      raHref={id => `${portalUrl()}/protect/risk-assessments/${id}`}
    />
  );
}
