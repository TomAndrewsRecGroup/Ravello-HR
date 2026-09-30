import { readAllPages } from '@/lib/supabase/paged';
import { createServiceSupabaseClient, portfolioOrgIds, type PortfolioSession } from './portfolioAccess';
import { classifyBoardAssuranceStatus, type BoardAssuranceReportSummaryRow, type ClientBoardAssuranceStatus } from './boardAssuranceStatus';

/** Shared by the /consultancy/board-assurance dashboard and Client
 *  360's own summary card so the two can never disagree about a
 *  client's bucket. `board_assurance_reports` has no consultancy RLS
 *  policy at all (178: staff FOR ALL, client read only when issued
 *  AND company_id = the ACTIVE org) — the exact gap every portfolio-
 *  wide read in this codebase has had to work around since Phase 6,
 *  so this reads with the SERVICE ROLE, scoped to the caller's own
 *  authorised org id list. */
export async function loadBoardAssuranceStatus(portfolio: PortfolioSession): Promise<ClientBoardAssuranceStatus[]> {
  const orgIds = portfolioOrgIds(portfolio.organisations);
  if (orgIds.length === 0) return [];

  const sb = createServiceSupabaseClient();
  const { rows: reportRows, error } = await readAllPages<any>((from, to) =>
    sb.from('board_assurance_reports')
      .select('id, company_id, year, quarter, status, issued_at, report_data')
      .in('company_id', orgIds).order('id').range(from, to));
  if (error) throw new Error(error);

  const rows: BoardAssuranceReportSummaryRow[] = reportRows.map((r: any) => ({
    company_id: r.company_id,
    year: r.year,
    quarter: r.quarter,
    status: r.status,
    issued_at: r.issued_at,
    overall_band: r.report_data?.overallBand ?? 'green',
    trend: r.report_data?.trend ?? null,
  }));

  return classifyBoardAssuranceStatus(
    portfolio.organisations.map(o => ({ organisation_id: o.organisation_id, name: o.name })),
    rows,
    new Date(),
  );
}
