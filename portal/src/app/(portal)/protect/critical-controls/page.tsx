import type { Metadata } from 'next';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { computeCriticalControlVisibility, type CriticalControlCatalogueRow, type CriticalControlAssessmentRow } from '@/lib/criticalControls/compute';
import CriticalControlsView from '@/components/hs/CriticalControlsView';

export const metadata: Metadata = { title: 'Critical Controls' };
export const dynamic = 'force-dynamic';

// Critical Control Visibility (go-live gap list, item 4, 2026-10-02).
// Read-only — nothing here is self-certified, the standing PROTECT
// posture. Same pure computation as the admin page
// (lib/criticalControls/compute.ts, mirrored byte-identical), fetched
// by id list and joined in TS (never a chained embed), the same
// discipline /health-safety's own risk-graph/critical-controls pages
// already use for this exact table.
export default async function ProtectCriticalControlsPage() {
  const supabase = await createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [controls, riskItemControls, raItems, assessments] = await Promise.all([
    readAllPages<CriticalControlCatalogueRow>((from, to) =>
      supabase.from('controls').select('id, title, safety_critical, status').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ risk_assessment_item_id: string; control_id: string; effectiveness: string }>((from, to) =>
      supabase.from('risk_item_controls').select('risk_assessment_item_id, control_id, effectiveness')
        .eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<{ id: string; risk_assessment_id: string }>((from, to) =>
      supabase.from('risk_assessment_items').select('id, risk_assessment_id').eq('company_id', companyId).order('id').range(from, to)),
    readAllPages<CriticalControlAssessmentRow>((from, to) =>
      supabase.from('risk_assessments').select('id, title, status').eq('company_id', companyId).order('id').range(from, to)),
  ]);

  const loadError = controls.error ?? riskItemControls.error ?? raItems.error ?? assessments.error ?? null;

  const raIdByItem = new Map(raItems.rows.map(i => [i.id, i.risk_assessment_id]));
  const useRows = riskItemControls.rows
    .map(u => ({ ...u, risk_assessment_id: raIdByItem.get(u.risk_assessment_item_id) ?? '' }))
    .filter(u => u.risk_assessment_id);

  const statuses = computeCriticalControlVisibility(controls.rows, useRows, assessments.rows);

  return (
    <main className="portal-page flex-1">
      <CriticalControlsView
        statuses={statuses}
        loadError={loadError}
        raHref={id => `/protect/risk-assessments/${id}`}
      />
    </main>
  );
}
