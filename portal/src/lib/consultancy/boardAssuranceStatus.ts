// Core-OS 360 Completion Programme, Phase 27, Group 2 (gap-ledger row
// C13.6 — "cross-client consultant assurance dashboard"). Portal-only:
// `board_assurance_reports` (178) has no admin-side cross-client
// consultancy reader at all — recording, reviewing and issuing a
// report is a per-client staff act on the admin app's own
// `/health-safety/<companyId>/board-assurance` page; seeing the whole
// PORTFOLIO'S posture in one place is a consultant (portal) need,
// the same split Client 360 and the Attention Queue already draw.
//
// Pure classification only — no new raw fact. `overallBand`/`trend`
// are read straight off each report's OWN already-computed
// `report_data` (Phase 13's own computeBoardAssuranceReport()), never
// re-derived here.

export type BoardAssuranceBucket = 'current' | 'overdue' | 'missing';

// A grace window before flagging a period overdue — day 1 of a new
// quarter needs SOME time to generate and issue a report for it. The
// same "a grace window before flagging overdue" shape lib/reminders/
// rules.ts's own due-bucket scheme already uses elsewhere in this
// codebase, applied here to a genuinely new (quarterly) cadence.
export const OVERDUE_GRACE_DAYS = 15;

export interface BoardAssuranceReportSummaryRow {
  company_id: string;
  year: number;
  quarter: number;
  status: 'draft' | 'issued';
  issued_at: string | null;
  overall_band: 'red' | 'amber' | 'green';
  trend: 'improved' | 'declined' | 'unchanged' | null;
}

export interface ClientBoardAssuranceStatus {
  organisationId: string;
  organisationName: string;
  bucket: BoardAssuranceBucket;
  deteriorating: boolean;
  latestIssued: { year: number; quarter: number; issuedAt: string | null; overallBand: 'red' | 'amber' | 'green' } | null;
}

function currentQuarter(today: Date): { year: number; quarter: number } {
  return { year: today.getUTCFullYear(), quarter: Math.floor(today.getUTCMonth() / 3) + 1 };
}

function quarterStartDate(year: number, quarter: number): Date {
  return new Date(Date.UTC(year, (quarter - 1) * 3, 1));
}

/** Given every client's own `board_assurance_reports` rows (any status,
 *  any period — the caller fetches the company's FULL history, not a
 *  filtered slice, since "has this client EVER had a report" and "what
 *  was the most recent ISSUED one's trend" both need the whole set),
 *  classify each authorised organisation into one bucket plus an
 *  orthogonal deteriorating flag. */
export function classifyBoardAssuranceStatus(
  organisations: { organisation_id: string; name: string }[],
  reports: BoardAssuranceReportSummaryRow[],
  today: Date,
): ClientBoardAssuranceStatus[] {
  const { year: curYear, quarter: curQuarter } = currentQuarter(today);
  const quarterAgeDays = Math.floor((today.getTime() - quarterStartDate(curYear, curQuarter).getTime()) / 86_400_000);

  const byOrg = new Map<string, BoardAssuranceReportSummaryRow[]>();
  for (const r of reports) {
    const list = byOrg.get(r.company_id) ?? [];
    list.push(r);
    byOrg.set(r.company_id, list);
  }

  return organisations.map(org => {
    const rows = byOrg.get(org.organisation_id) ?? [];
    const everHadAnyReport = rows.length > 0;

    const issuedRows = rows.filter(r => r.status === 'issued');
    const latestIssuedRow = issuedRows.slice().sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter))[0] ?? null;

    const currentPeriodIssued = issuedRows.some(r => r.year === curYear && r.quarter === curQuarter);

    let bucket: BoardAssuranceBucket;
    if (!everHadAnyReport) {
      bucket = 'missing';
    } else if (!currentPeriodIssued && quarterAgeDays >= OVERDUE_GRACE_DAYS) {
      bucket = 'overdue';
    } else {
      bucket = 'current';
    }

    return {
      organisationId: org.organisation_id,
      organisationName: org.name,
      bucket,
      deteriorating: latestIssuedRow?.trend === 'declined',
      latestIssued: latestIssuedRow
        ? { year: latestIssuedRow.year, quarter: latestIssuedRow.quarter, issuedAt: latestIssuedRow.issued_at, overallBand: latestIssuedRow.overall_band }
        : null,
    };
  });
}
