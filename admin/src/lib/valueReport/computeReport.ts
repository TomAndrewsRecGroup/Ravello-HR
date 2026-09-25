import { computeLeadMetrics, type AbsenceRecordRow, type OnboardingInstanceRow, type PerformanceReviewRow, type TrainingNeedRow } from './leadMetrics';

// The full Client Value Report computation, extracted from
// ValueReportClient's useMemo so the monthly auto-generation cron
// (server-side, no React) computes EXACTLY what a staff member
// downloading the same company/month from the page would get — one
// calculation, not two that could drift.

export function inMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

export interface ValueReportInputs {
  requisitions: any[];
  candidates: any[];
  tickets: any[];
  documents: any[];
  complianceItems: any[];
  serviceRequests: any[];
  actions: any[];
  profiles: any[];
  services: any[];
  trainingNeeds: TrainingNeedRow[];
  performanceReviews: PerformanceReviewRow[];
  absenceRecords: AbsenceRecordRow[];
  onboardingInstances: OnboardingInstanceRow[];
}

export interface ValueReportData {
  hire: { newRoles: number; filled: number; candidates: number; activeRoles: number; totalFilled: number };
  support: { ticketsRaised: number; ticketsResolved: number; avgResolutionHours: number; serviceRequests: number; serviceRequestsResponded: number };
  protect: { complianceItems: number; documentsUploaded: number; actionsCreated: number; actionsCompleted: number };
  lead: ReturnType<typeof computeLeadMetrics>;
  usage: { portalUsers: number; activeServices: any[]; mrr: number };
}

export function computeValueReport(companyId: string, year: number, month: number, d: ValueReportInputs): ValueReportData {
  const cid = companyId;

  const monthReqs = d.requisitions.filter((r: any) => r.company_id === cid && inMonth(r.created_at, year, month));
  const filledReqs = d.requisitions.filter((r: any) => r.company_id === cid && r.stage === 'filled' && inMonth(r.updated_at, year, month));
  const monthCandidates = d.candidates.filter((c: any) => c.company_id === cid && inMonth(c.created_at, year, month));
  const monthTickets = d.tickets.filter((t: any) => t.company_id === cid && inMonth(t.created_at, year, month));
  const resolvedTickets = d.tickets.filter((t: any) => t.company_id === cid && inMonth(t.resolved_at, year, month));
  const monthDocs = d.documents.filter((doc: any) => doc.company_id === cid && inMonth(doc.created_at, year, month));
  const monthCompliance = d.complianceItems.filter((c: any) => c.company_id === cid && inMonth(c.created_at, year, month));
  const monthServReqs = d.serviceRequests.filter((s: any) => s.company_id === cid && inMonth(s.created_at, year, month));
  const respondedServReqs = d.serviceRequests.filter((s: any) => s.company_id === cid && inMonth(s.responded_at, year, month));
  const monthActions = d.actions.filter((a: any) => a.company_id === cid && inMonth(a.created_at, year, month));
  const completedActions = d.actions.filter((a: any) => a.company_id === cid && inMonth(a.completed_at, year, month));

  const totalActiveRoles = d.requisitions.filter((r: any) => r.company_id === cid && !['filled', 'cancelled'].includes(r.stage)).length;
  const totalFilled = d.requisitions.filter((r: any) => r.company_id === cid && r.stage === 'filled').length;
  const totalUsers = d.profiles.filter((p: any) => p.company_id === cid).length;
  const activeServices = d.services.filter((s: any) => s.company_id === cid);
  const mrr = activeServices.reduce((sum: number, s: any) => sum + (s.monthly_fee ?? 0), 0);

  const resolved = d.tickets.filter((t: any) => t.company_id === cid && t.resolved_at && inMonth(t.resolved_at, year, month));
  let avgResolution = 0;
  if (resolved.length > 0) {
    const totalHours = resolved.reduce((sum: number, t: any) => sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 3600000, 0);
    avgResolution = Math.round(totalHours / resolved.length);
  }

  const lead = computeLeadMetrics(cid, year, month, d.trainingNeeds, d.performanceReviews, d.absenceRecords, d.onboardingInstances);

  return {
    hire: { newRoles: monthReqs.length, filled: filledReqs.length, candidates: monthCandidates.length, activeRoles: totalActiveRoles, totalFilled },
    support: { ticketsRaised: monthTickets.length, ticketsResolved: resolvedTickets.length, avgResolutionHours: avgResolution, serviceRequests: monthServReqs.length, serviceRequestsResponded: respondedServReqs.length },
    protect: { complianceItems: monthCompliance.length, documentsUploaded: monthDocs.length, actionsCreated: monthActions.length, actionsCompleted: completedActions.length },
    lead,
    usage: { portalUsers: totalUsers, activeServices, mrr },
  };
}
