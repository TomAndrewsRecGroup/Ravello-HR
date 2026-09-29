// Core-OS 360 Phase 13, Group 1: Board Assurance & Executive Reporting.
//
// Pure assembly of facts this codebase ALREADY computes — see the
// phase's own plan doc, docs/CORE_OS_360_PHASE13_PLAN.md. No new raw
// fact is computed in this file:
//   - complianceTwin: lib/complianceTwin/assemble.ts's own output (Phase 12)
//   - portfolioCounts: lib/health/portfolioCounts.ts's own output (Phase 6),
//     called for ONE company rather than the whole portfolio
//   - latestManagementReview: the most recently COMPLETED
//     management_reviews row + its own management_review_decisions
//     (Phase 5 Group 6)
//
// Trend needs no new snapshot-history table — see the plan doc's own
// reasoning: the sequence of PAST STORED board_assurance_reports rows
// already is the trend history. This function only compares THIS
// quarter's computed overall band against the immediately prior
// STORED report's own band, exactly the way a human reading two
// consecutive board packs would.

import type { ComplianceTwinSnapshot, ComplianceTwinBand } from '@/lib/complianceTwin/assemble';
import type { PortfolioCounts } from '@/lib/health/portfolioCounts';

export interface ManagementReviewDecisionSummary {
  topic: string;
  decisionText: string;
}

export interface LatestManagementReview {
  reviewDate: string;
  decisions: ManagementReviewDecisionSummary[];
}

export interface PriorBoardAssuranceReport {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  overallBand: ComplianceTwinBand;
}

export type BoardAssuranceTrend = 'improved' | 'declined' | 'unchanged';

export interface BoardAssuranceReportInput {
  companyId: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  generatedAt: string;
  complianceTwin: ComplianceTwinSnapshot;
  portfolioCounts: PortfolioCounts;
  latestManagementReview: LatestManagementReview | null;
  priorReport: PriorBoardAssuranceReport | null;
}

export interface BoardAssuranceReportData {
  companyId: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  generatedAt: string;
  overallBand: ComplianceTwinBand;
  complianceTwin: ComplianceTwinSnapshot;
  portfolioCounts: PortfolioCounts;
  latestManagementReview: LatestManagementReview | null;
  /** Null when there is no prior stored report to compare against — never guessed. */
  trend: BoardAssuranceTrend | null;
  priorPeriod: { year: number; quarter: 1 | 2 | 3 | 4 } | null;
}

const BAND_SEVERITY: Record<ComplianceTwinBand, number> = { green: 0, amber: 1, red: 2 };

function deriveTrend(current: ComplianceTwinBand, prior: ComplianceTwinBand): BoardAssuranceTrend {
  if (BAND_SEVERITY[current] < BAND_SEVERITY[prior]) return 'improved';
  if (BAND_SEVERITY[current] > BAND_SEVERITY[prior]) return 'declined';
  return 'unchanged';
}

export function computeBoardAssuranceReport(input: BoardAssuranceReportInput): BoardAssuranceReportData {
  const { priorReport, complianceTwin } = input;

  return {
    companyId: input.companyId,
    year: input.year,
    quarter: input.quarter,
    generatedAt: input.generatedAt,
    overallBand: complianceTwin.overallBand,
    complianceTwin,
    portfolioCounts: input.portfolioCounts,
    latestManagementReview: input.latestManagementReview,
    trend: priorReport ? deriveTrend(complianceTwin.overallBand, priorReport.overallBand) : null,
    priorPeriod: priorReport ? { year: priorReport.year, quarter: priorReport.quarter } : null,
  };
}
