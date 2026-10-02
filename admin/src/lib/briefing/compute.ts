// Daily Management Briefing (go-live gap list, item 9, 2026-10-02).
//
// Pure composition over the EXISTING daily client_health_snapshots row
// (107, widened in 168) — no new table, no new query shape, no AI, no
// score. The snapshot already carries every named signal this briefing
// surfaces (open_critical_actions, overdue_legal_evaluations, …);
// this file only buckets companies by which signals fired today and
// sorts them, the identical "fixed, named threshold, inspectable
// reason" discipline every KPI/intelligence module in this codebase
// already follows (lib/health/scoring.ts, lib/core360Status/assemble.ts,
// lib/complianceTwin/assemble.ts).
//
// Reusing the already-computed daily snapshot (rather than re-deriving
// ~13 live cross-company queries here) means this page costs exactly
// one more read of a table the cron already writes once a day — it
// can never diverge from what /health's own band column says for the
// same company on the same day.

export type BriefingBand = 'green' | 'amber' | 'red';
export type BriefingSeverity = 'critical' | 'warning';

export interface BriefingSnapshotRow {
  company_id: string;
  band: BriefingBand;
  overdue_comp: number;
  open_tickets: number;
  stalled_reqs: number;
  open_critical_actions: number;
  overdue_legal_evaluations: number;
  overdue_controlled_documents: number;
  open_incident_investigations: number;
  safety_critical_gaps: number;
  workers_not_ready: number;
  assets_unavailable: number;
  major_audit_findings: number;
  contractor_expiring: number;
  environmental_permits_expiring: number;
  management_reviews_due: number;
  outstanding_service_requests: number;
  next_consultant_visit_date: string | null;
}

export interface BriefingCompanyFlag {
  companyId: string;
  companyName: string;
  severity: BriefingSeverity;
  key: string;
  reason: string;
  count: number;
}

export interface BriefingCompanySummary {
  companyId: string;
  companyName: string;
  band: BriefingBand;
  flagCount: number;
  criticalCount: number;
}

export interface DailyBriefing {
  date: string;
  totalCompanies: number;
  redCompanies: number;
  amberCompanies: number;
  cleanCompanies: number;
  flags: BriefingCompanyFlag[];
  companies: BriefingCompanySummary[];
  totals: Record<string, number>;
}

// Three-way thresholds mirror lib/core360Status/assemble.ts's own Plant
// domain (1-2 "a few", 3+ "a pattern") for the one signal that needs
// more than a bare >0 check; every other signal is a plain count —
// any amount of a critical/legal/safety-critical finding is worth a
// line in a daily briefing, there is no "a little bit overdue" tier.
function assetSeverity(n: number): BriefingSeverity | null {
  if (n <= 0) return null;
  return n >= 3 ? 'critical' : 'warning';
}

interface FlagRule {
  key: keyof BriefingSnapshotRow;
  severity: BriefingSeverity | ((n: number) => BriefingSeverity | null);
  reason: (n: number) => string;
}

const RULES: FlagRule[] = [
  { key: 'safety_critical_gaps', severity: 'critical', reason: n => `${n} safety-critical Safe-to-Deploy gap${n === 1 ? '' : 's'}` },
  { key: 'open_critical_actions', severity: 'critical', reason: n => `${n} open high/critical action${n === 1 ? '' : 's'}` },
  { key: 'major_audit_findings', severity: 'critical', reason: n => `${n} major/critical open audit finding${n === 1 ? '' : 's'}` },
  { key: 'assets_unavailable', severity: assetSeverity, reason: n => `${n} asset${n === 1 ? '' : 's'} quarantined or out of service` },
  { key: 'workers_not_ready', severity: 'warning', reason: n => `${n} worker${n === 1 ? '' : 's'} not currently Safe to Deploy` },
  { key: 'open_incident_investigations', severity: 'warning', reason: n => `${n} incident investigation${n === 1 ? '' : 's'} still open` },
  { key: 'overdue_legal_evaluations', severity: 'warning', reason: n => `${n} overdue legal obligation review${n === 1 ? '' : 's'}` },
  { key: 'overdue_controlled_documents', severity: 'warning', reason: n => `${n} H&S document${n === 1 ? '' : 's'} due for review` },
  { key: 'contractor_expiring', severity: 'warning', reason: n => `${n} contractor${n === 1 ? '' : 's'} with expiring or missing insurance` },
  { key: 'environmental_permits_expiring', severity: 'warning', reason: n => `${n} environmental permit${n === 1 ? '' : 's'} expiring soon` },
  { key: 'management_reviews_due', severity: 'warning', reason: n => `${n} management review${n === 1 ? '' : 's'} due` },
  { key: 'outstanding_service_requests', severity: 'warning', reason: n => `${n} outstanding support request${n === 1 ? '' : 's'}` },
  { key: 'stalled_reqs', severity: 'warning', reason: n => `${n} hiring role${n === 1 ? '' : 's'} stalled for 2+ weeks` },
  { key: 'overdue_comp', severity: 'warning', reason: n => `${n} overdue HR compliance item${n === 1 ? '' : 's'}` },
];

const TOTAL_KEYS: (keyof BriefingSnapshotRow)[] = [
  'open_critical_actions', 'overdue_legal_evaluations', 'overdue_controlled_documents',
  'open_incident_investigations', 'safety_critical_gaps', 'workers_not_ready',
  'assets_unavailable', 'major_audit_findings', 'contractor_expiring',
  'environmental_permits_expiring', 'management_reviews_due', 'outstanding_service_requests',
  'stalled_reqs', 'overdue_comp',
];

export function assembleDailyBriefing(
  date: string,
  rows: BriefingSnapshotRow[],
  companyNames: Map<string, string>,
): DailyBriefing {
  const flags: BriefingCompanyFlag[] = [];
  const totals: Record<string, number> = {};
  for (const k of TOTAL_KEYS) totals[k as string] = 0;

  let red = 0, amber = 0, clean = 0;
  const companies: BriefingCompanySummary[] = [];

  for (const row of rows) {
    const companyName = companyNames.get(row.company_id) ?? 'Unknown client';
    if (row.band === 'red') red++;
    else if (row.band === 'amber') amber++;

    let flagCount = 0, criticalCount = 0;
    for (const rule of RULES) {
      const n = (row[rule.key] as number) ?? 0;
      for (const k of TOTAL_KEYS) if (rule.key === k) totals[k as string] += n;
      const severity = typeof rule.severity === 'function' ? rule.severity(n) : (n > 0 ? rule.severity : null);
      if (!severity) continue;
      flagCount++;
      if (severity === 'critical') criticalCount++;
      flags.push({
        companyId: row.company_id,
        companyName,
        severity,
        key: rule.key as string,
        reason: rule.reason(n),
        count: n,
      });
    }

    if (flagCount === 0) clean++;
    companies.push({ companyId: row.company_id, companyName, band: row.band, flagCount, criticalCount });
  }

  flags.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.companyName.localeCompare(b.companyName);
  });
  companies.sort((a, b) => {
    if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
    if (b.flagCount !== a.flagCount) return b.flagCount - a.flagCount;
    return a.companyName.localeCompare(b.companyName);
  });

  return {
    date,
    totalCompanies: rows.length,
    redCompanies: red,
    amberCompanies: amber,
    cleanCompanies: clean,
    flags,
    companies,
    totals,
  };
}
