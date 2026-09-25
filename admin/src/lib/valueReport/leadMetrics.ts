// LEAD section of the Client Value Report — people-management metrics
// derived from real tables (training_needs, performance_reviews,
// absence_records, onboarding_instances), not hand entry. Pulled out
// of ValueReportClient's useMemo so the month-boundary and "overdue as
// of the report month" logic is unit-testable without a browser.
//
// Distinct from the SUPPORT section (ticket/service-request handling):
// this is genuinely different content, not a rename of it — see
// CLAUDE.md's naming/flags sweep, which flagged this as a real gap.

export interface TrainingNeedRow { company_id: string; status: string; created_at: string; updated_at: string }
export interface PerformanceReviewRow { company_id: string; status: string; due_date: string | null; completed_at: string | null; created_at: string }
export interface AbsenceRecordRow { company_id: string; status: string; start_date: string; days: number | null }
export interface OnboardingInstanceRow { company_id: string; status: string; started_at: string | null; completed_at: string | null }

export interface LeadMetrics {
  trainingNeedsFlagged: number;
  trainingNeedsResolved: number;
  trainingNeedsOpen: number;
  reviewsDue: number;
  reviewsCompleted: number;
  reviewsOverdue: number;
  absenceDays: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  onboardingActive: number;
}

function inMonth(dateStr: string | null, year: number, month: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

export function computeLeadMetrics(
  companyId: string, year: number, month: number,
  trainingNeeds: TrainingNeedRow[], performanceReviews: PerformanceReviewRow[],
  absenceRecords: AbsenceRecordRow[], onboardingInstances: OnboardingInstanceRow[],
): LeadMetrics {
  const monthTraining = trainingNeeds.filter(t => t.company_id === companyId && inMonth(t.created_at, year, month));
  const resolvedTraining = trainingNeeds.filter(t => t.company_id === companyId && t.status === 'resolved' && inMonth(t.updated_at, year, month));
  const openTraining = trainingNeeds.filter(t => t.company_id === companyId && ['open', 'in_progress'].includes(t.status));

  const dueReviews = performanceReviews.filter(r => r.company_id === companyId && r.due_date && inMonth(r.due_date, year, month));
  const completedReviews = performanceReviews.filter(r => r.company_id === companyId && r.status === 'completed' && inMonth(r.completed_at, year, month));
  // "Overdue" is relative to the REPORT month, not today — a report run
  // later for an earlier month must not show today's overdue count.
  const monthStart = new Date(year, month, 1);
  const overdueReviews = performanceReviews.filter(r =>
    r.company_id === companyId && r.status !== 'completed' && r.status !== 'cancelled'
    && r.due_date && new Date(r.due_date) < monthStart,
  );

  const monthAbsences = absenceRecords.filter(a => a.company_id === companyId && inMonth(a.start_date, year, month));
  const absenceDays = monthAbsences.reduce((sum, a) => sum + (Number(a.days) || 0), 0);

  const startedOnboarding = onboardingInstances.filter(o => o.company_id === companyId && inMonth(o.started_at, year, month));
  const completedOnboarding = onboardingInstances.filter(o => o.company_id === companyId && inMonth(o.completed_at, year, month));
  const activeOnboarding = onboardingInstances.filter(o => o.company_id === companyId && o.status === 'in_progress');

  return {
    trainingNeedsFlagged: monthTraining.length,
    trainingNeedsResolved: resolvedTraining.length,
    trainingNeedsOpen: openTraining.length,
    reviewsDue: dueReviews.length,
    reviewsCompleted: completedReviews.length,
    reviewsOverdue: overdueReviews.length,
    absenceDays,
    onboardingStarted: startedOnboarding.length,
    onboardingCompleted: completedOnboarding.length,
    onboardingActive: activeOnboarding.length,
  };
}
