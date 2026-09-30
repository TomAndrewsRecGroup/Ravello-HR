import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBody } from '@/lib/validation/parseBody';
import { uuid } from '@/lib/validation/primitives';
import { loadComplianceTwinSnapshot } from '@/lib/complianceTwin/loadSnapshot';
import { loadPortfolioCountsForCompany } from '@/lib/boardAssurance/loadPortfolioCounts';
import { computeBoardAssuranceReport, type LatestManagementReview, type PriorBoardAssuranceReport } from '@/lib/boardAssurance/computeReport';

export const runtime = 'nodejs';

const Schema = z.object({
  companyId: uuid,
  year: z.number().int().min(2020).max(2100),
  quarter: z.number().int().min(1).max(4),
});

function priorPeriod(year: number, quarter: number): { year: number; quarter: number } {
  return quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 };
}

// Core-OS 360 Phase 13, Group 2. Generates a DRAFT board assurance
// report — the exact "one calculation, not two" reuse this phase's own
// plan doc commits to: the Digital Twin snapshot, portfolio counts and
// the latest completed management review are all read the SAME way
// their own existing pages already read them, never recomputed here.
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, Schema);
  if (!parsed.ok) return parsed.response;
  const { companyId, year, quarter } = parsed.data;

  const supabase = await createServerSupabaseClient();

  const [{ snapshot, loadError: twinError }, { counts, loadError: countsError }] = await Promise.all([
    loadComplianceTwinSnapshot(supabase, companyId),
    loadPortfolioCountsForCompany(supabase, companyId),
  ]);
  const loadError = twinError ?? countsError;
  if (loadError) return NextResponse.json({ error: loadError }, { status: 500 });

  const { data: reviewRows, error: reviewErr } = await supabase
    .from('management_reviews').select('id, review_date')
    .eq('company_id', companyId).eq('status', 'completed')
    .order('review_date', { ascending: false }).limit(1);
  if (reviewErr) return NextResponse.json({ error: reviewErr.message }, { status: 500 });

  let latestManagementReview: LatestManagementReview | null = null;
  const latestReview = (reviewRows ?? [])[0] as { id: string; review_date: string } | undefined;
  if (latestReview) {
    const { data: decisions, error: decErr } = await supabase
      .from('management_review_decisions').select('topic, decision_text')
      .eq('review_id', latestReview.id).limit(200);
    if (decErr) return NextResponse.json({ error: decErr.message }, { status: 500 });
    latestManagementReview = {
      reviewDate: latestReview.review_date,
      decisions: (decisions ?? []).map(d => ({ topic: d.topic as string, decisionText: d.decision_text as string })),
    };
  }

  const prior = priorPeriod(year, quarter);
  const { data: priorRows, error: priorErr } = await supabase
    .from('board_assurance_reports').select('report_data')
    .eq('company_id', companyId).eq('year', prior.year).eq('quarter', prior.quarter).limit(1);
  if (priorErr) return NextResponse.json({ error: priorErr.message }, { status: 500 });

  let priorReport: PriorBoardAssuranceReport | null = null;
  const priorRow = (priorRows ?? [])[0] as { report_data: { overallBand?: string } } | undefined;
  if (priorRow?.report_data?.overallBand) {
    priorReport = { year: prior.year, quarter: prior.quarter as 1 | 2 | 3 | 4, overallBand: priorRow.report_data.overallBand as 'red' | 'amber' | 'green' };
  }

  const reportData = computeBoardAssuranceReport({
    companyId, year, quarter: quarter as 1 | 2 | 3 | 4,
    generatedAt: new Date().toISOString(),
    complianceTwin: snapshot,
    portfolioCounts: counts,
    latestManagementReview,
    priorReport,
  });

  const { data: inserted, error: insertErr } = await supabase
    .from('board_assurance_reports')
    .insert({ company_id: companyId, year, quarter, report_data: reportData })
    .select('id, status')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'A report for this company and quarter already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.id, status: inserted.status });
}
