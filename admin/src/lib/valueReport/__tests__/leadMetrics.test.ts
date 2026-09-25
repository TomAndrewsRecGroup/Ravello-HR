import { describe, expect, it } from 'vitest';
import { computeLeadMetrics } from '../leadMetrics';

const CO = 'co-1';
const OTHER = 'co-2';

describe('computeLeadMetrics', () => {
  it('counts training needs flagged this month, resolved this month, and currently open — ignoring other companies', () => {
    const training = [
      { company_id: CO, status: 'open', created_at: '2026-09-05', updated_at: '2026-09-05' },
      { company_id: CO, status: 'resolved', created_at: '2026-08-01', updated_at: '2026-09-10' },
      { company_id: CO, status: 'in_progress', created_at: '2026-07-01', updated_at: '2026-07-01' },
      { company_id: OTHER, status: 'open', created_at: '2026-09-05', updated_at: '2026-09-05' },
    ];
    const m = computeLeadMetrics(CO, 2026, 8, training, [], [], []); // September = month 8
    expect(m.trainingNeedsFlagged).toBe(1);
    expect(m.trainingNeedsResolved).toBe(1);
    expect(m.trainingNeedsOpen).toBe(2); // the open one + the in_progress one, regardless of month
  });

  it('counts reviews due this month and completed this month', () => {
    const reviews = [
      { company_id: CO, status: 'pending', due_date: '2026-09-15', completed_at: null, created_at: '2026-08-01' },
      { company_id: CO, status: 'completed', due_date: '2026-08-20', completed_at: '2026-09-02', created_at: '2026-08-01' },
      { company_id: OTHER, status: 'pending', due_date: '2026-09-15', completed_at: null, created_at: '2026-08-01' },
    ];
    const m = computeLeadMetrics(CO, 2026, 8, [], reviews, [], []);
    expect(m.reviewsDue).toBe(1);
    expect(m.reviewsCompleted).toBe(1);
  });

  it('"overdue" is relative to the REPORT month, not today — a report for an earlier month does not pick up today\'s overdue reviews', () => {
    const reviews = [
      // due before September 2026's start, still not completed
      { company_id: CO, status: 'pending', due_date: '2026-08-10', completed_at: null, created_at: '2026-07-01' },
      // due IN September — not yet overdue as of the September report
      { company_id: CO, status: 'pending', due_date: '2026-09-20', completed_at: null, created_at: '2026-07-01' },
      // cancelled — never counts as overdue
      { company_id: CO, status: 'cancelled', due_date: '2026-07-01', completed_at: null, created_at: '2026-06-01' },
    ];
    const m = computeLeadMetrics(CO, 2026, 8, [], reviews, [], []); // September report
    expect(m.reviewsOverdue).toBe(1);

    // The same data, reported for August (month 7): nothing is overdue
    // yet since due_date 2026-08-10 is not before August's own start.
    const august = computeLeadMetrics(CO, 2026, 7, [], reviews, [], []);
    expect(august.reviewsOverdue).toBe(0);
  });

  it('sums absence days for records starting in the month', () => {
    const absences = [
      { company_id: CO, status: 'approved', start_date: '2026-09-03', days: 2 },
      { company_id: CO, status: 'approved', start_date: '2026-09-15', days: 1.5 },
      { company_id: CO, status: 'approved', start_date: '2026-08-30', days: 5 }, // different month
      { company_id: OTHER, status: 'approved', start_date: '2026-09-03', days: 10 },
    ];
    const m = computeLeadMetrics(CO, 2026, 8, [], [], absences, []);
    expect(m.absenceDays).toBe(3.5);
  });

  it('a null days value contributes zero, not NaN', () => {
    const absences = [{ company_id: CO, status: 'approved', start_date: '2026-09-03', days: null }];
    const m = computeLeadMetrics(CO, 2026, 8, [], [], absences, []);
    expect(m.absenceDays).toBe(0);
  });

  it('counts onboarding started and completed this month, and active regardless of month', () => {
    const onboarding = [
      { company_id: CO, status: 'in_progress', started_at: '2026-09-01', completed_at: null },
      { company_id: CO, status: 'completed', started_at: '2026-08-01', completed_at: '2026-09-10' },
      { company_id: CO, status: 'in_progress', started_at: '2026-07-01', completed_at: null },
    ];
    const m = computeLeadMetrics(CO, 2026, 8, [], [], [], onboarding);
    expect(m.onboardingStarted).toBe(1);
    expect(m.onboardingCompleted).toBe(1);
    expect(m.onboardingActive).toBe(2);
  });

  it('returns all zeros for a company with no rows', () => {
    const m = computeLeadMetrics('nope', 2026, 8, [], [], [], []);
    expect(m).toEqual({
      trainingNeedsFlagged: 0, trainingNeedsResolved: 0, trainingNeedsOpen: 0,
      reviewsDue: 0, reviewsCompleted: 0, reviewsOverdue: 0,
      absenceDays: 0, onboardingStarted: 0, onboardingCompleted: 0, onboardingActive: 0,
    });
  });
});
