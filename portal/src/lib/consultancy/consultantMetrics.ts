import { reportsNeedingFollowUp, type ClientVisitDate, type FollowUpCandidate } from './followUpDue';
import type { ObservationType } from './vocab';

// Core-OS 360 Phase 7, Group 6 ("Consultant Metrics"). Factual
// aggregation only — no score, no AI, nothing predicted. Every number
// here is a plain count or average over rows the platform already
// wrote, the same "no stored aggregate that can drift out of sync"
// posture lib/health/scoring.ts and lib/hs/kpis.ts already take.

export interface MetricsVisit { id: string; client_organisation_id: string; scheduled_date: string; status: string }
export interface MetricsReport { id: string; visit_id: string; client_organisation_id: string; status: string; issued_at: string | null; next_visit_recommended_date: string | null }
export interface MetricsObservation { observation_type: ObservationType; created_at: string }
export interface MetricsAction { source_type: string | null; status: string; created_at: string; completed_at: string | null }

export interface ConsultantMetrics {
  visitsCompleted: number;
  reportsIssued: number;
  avgDaysVisitToReportIssued: number | null;
  observationsRecorded: number;
  observationsByType: Record<ObservationType, number>;
  actionsRaised: number;
  actionsClosed: number;
  followUpsBooked: number;
  followUpsOutstanding: number;
}

const inPeriod = (d: string, from: string, to: string) => d >= from && d <= to;

export function computeConsultantMetrics(
  input: { visits: MetricsVisit[]; reports: MetricsReport[]; observations: MetricsObservation[]; actions: MetricsAction[] },
  period: { from: string; to: string },
): ConsultantMetrics {
  const { visits, reports, observations, actions } = input;
  const { from, to } = period;

  const visitById = new Map(visits.map(v => [v.id, v]));

  const visitsCompleted = visits.filter(v => (v.status === 'report_issued' || v.status === 'closed') && inPeriod(v.scheduled_date, from, to)).length;

  const issuedInPeriod = reports.filter(r => r.status === 'issued' && r.issued_at && inPeriod(r.issued_at.slice(0, 10), from, to));
  const reportsIssued = issuedInPeriod.length;

  const lagDays: number[] = [];
  for (const r of issuedInPeriod) {
    const visit = visitById.get(r.visit_id);
    if (!visit || !r.issued_at) continue;
    const days = Math.round((Date.parse(r.issued_at.slice(0, 10)) - Date.parse(visit.scheduled_date)) / 86_400_000);
    if (days >= 0) lagDays.push(days);
  }
  const avgDaysVisitToReportIssued = lagDays.length > 0 ? Math.round((lagDays.reduce((a, b) => a + b, 0) / lagDays.length) * 10) / 10 : null;

  const obsInPeriod = observations.filter(o => inPeriod(o.created_at.slice(0, 10), from, to));
  const observationsByType = obsInPeriod.reduce((acc, o) => {
    acc[o.observation_type] = (acc[o.observation_type] ?? 0) + 1;
    return acc;
  }, {} as Record<ObservationType, number>);

  const visitActions = actions.filter(a => a.source_type === 'consultant_visit');
  const actionsRaised = visitActions.filter(a => inPeriod(a.created_at.slice(0, 10), from, to)).length;
  const actionsClosed = visitActions.filter(a => a.status === 'complete' && a.completed_at && inPeriod(a.completed_at.slice(0, 10), from, to)).length;

  // Follow-up compliance is NOT period-scoped — a target set six months
  // ago and still unbooked is still outstanding today, regardless of
  // when the period window starts.
  const candidates: FollowUpCandidate[] = reports
    .filter((r): r is MetricsReport & { next_visit_recommended_date: string } => r.status === 'issued' && r.next_visit_recommended_date != null)
    .map(r => ({ id: r.id, visit_id: r.visit_id, client_organisation_id: r.client_organisation_id, next_visit_recommended_date: r.next_visit_recommended_date }));
  const visitDates: ClientVisitDate[] = visits.map(v => ({ client_organisation_id: v.client_organisation_id, visit_id: v.id, scheduled_date: v.scheduled_date }));
  const outstanding = reportsNeedingFollowUp(candidates, visitDates);

  return {
    visitsCompleted, reportsIssued, avgDaysVisitToReportIssued,
    observationsRecorded: obsInPeriod.length, observationsByType,
    actionsRaised, actionsClosed,
    followUpsBooked: candidates.length - outstanding.length,
    followUpsOutstanding: outstanding.length,
  };
}
