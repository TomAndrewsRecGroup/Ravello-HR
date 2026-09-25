import { daysUntil } from './recurrence';

// Pure KPI computation for a client's H&S record (112). Computed at
// read time from existing rows, the same way lib/health/scoring.ts
// derives a client health score — no new table, no stored aggregate to
// drift out of sync with the rows it summarises.
//
// "Last 12 months" is a rolling window from `today`, not a calendar
// year, so the KPI page reads the same whichever day it is opened.

export interface HsKpiIncident {
  severity: string;
  riddor_reportable: boolean;
  occurred_on: string;
}
export interface HsKpiActivity {
  activity_type: string;
  occurred_on: string;
}
export interface HsKpiAudit {
  score: number | null;
  conducted_on: string;
}
export interface HsKpiEquipment {
  status: string;
  next_inspection_due: string | null;
}

export interface HsKpiInput {
  incidents: HsKpiIncident[];
  activities: HsKpiActivity[];
  audits: HsKpiAudit[];
  equipment: HsKpiEquipment[];
  /** Today, as YYYY-MM-DD. Injected so this is testable without a clock. */
  today: string;
}

export interface HsKpis {
  incidentsLast12Months: number;
  riddorLast12Months: number;
  toolboxTalksLast12Months: number;
  lastAuditScore: number | null;
  auditScoreTrend: 'up' | 'down' | 'flat' | null;
  equipmentOverdueCount: number;
  equipmentDueSoonCount: number;
}

const within12Months = (date: string, today: string): boolean => {
  const d = daysUntil(date, today);
  return d <= 0 && d > -365;
};

export function computeHsKpis(input: HsKpiInput): HsKpis {
  const { incidents, activities, audits, equipment, today } = input;

  const recentIncidents = incidents.filter(i => within12Months(i.occurred_on, today));
  const recentActivities = activities.filter(a => within12Months(a.occurred_on, today));

  const sortedAudits = [...audits].sort((a, b) => (a.conducted_on < b.conducted_on ? 1 : -1));
  const lastAuditScore = sortedAudits[0]?.score ?? null;
  const previousAuditScore = sortedAudits[1]?.score ?? null;
  let auditScoreTrend: HsKpis['auditScoreTrend'] = null;
  if (lastAuditScore != null && previousAuditScore != null) {
    if (lastAuditScore > previousAuditScore) auditScoreTrend = 'up';
    else if (lastAuditScore < previousAuditScore) auditScoreTrend = 'down';
    else auditScoreTrend = 'flat';
  }

  let equipmentOverdueCount = 0;
  let equipmentDueSoonCount = 0;
  for (const e of equipment) {
    if (e.status !== 'in_service' || !e.next_inspection_due) continue;
    const d = daysUntil(e.next_inspection_due, today);
    if (d < 0) equipmentOverdueCount++;
    else if (d <= 30) equipmentDueSoonCount++;
  }

  return {
    incidentsLast12Months: recentIncidents.length,
    riddorLast12Months: recentIncidents.filter(i => i.riddor_reportable).length,
    toolboxTalksLast12Months: recentActivities.filter(a => a.activity_type === 'toolbox_talk').length,
    lastAuditScore,
    auditScoreTrend,
    equipmentOverdueCount,
    equipmentDueSoonCount,
  };
}
