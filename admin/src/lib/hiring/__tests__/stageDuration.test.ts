import { describe, it, expect } from 'vitest';
import { computeStageDurations, type StageHistoryRow, type RequisitionForDuration } from '../stageDuration';

const TODAY = '2026-10-02T00:00:00Z';

function req(overrides: Partial<RequisitionForDuration> = {}): RequisitionForDuration {
  return { id: 'r1', title: 'Software Engineer', created_at: '2026-09-01T00:00:00Z', ...overrides };
}

describe('computeStageDurations', () => {
  it('computes days-to-interview from requisition creation to the first entry into the interview stage', () => {
    const history: StageHistoryRow[] = [
      { requisition_id: 'r1', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-01T00:00:00Z' },
      { requisition_id: 'r1', from_stage: 'submitted', to_stage: 'in_progress', changed_at: '2026-09-03T00:00:00Z' },
      { requisition_id: 'r1', from_stage: 'in_progress', to_stage: 'interview', changed_at: '2026-09-08T00:00:00Z' },
    ];
    const summary = computeStageDurations(history, [req()], TODAY);
    expect(summary.perRequisition[0].daysToInterview).toBe(7);
    expect(summary.avgDaysToInterview).toBe(7);
  });

  it('is null for days-to-offer when a requisition never reached the offer stage', () => {
    const history: StageHistoryRow[] = [
      { requisition_id: 'r1', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-01T00:00:00Z' },
    ];
    const summary = computeStageDurations(history, [req()], TODAY);
    expect(summary.perRequisition[0].daysToOffer).toBeNull();
    expect(summary.avgDaysToOffer).toBeNull();
  });

  it('only averages requisitions that actually reached the milestone, never treating a non-reaching one as zero', () => {
    const history: StageHistoryRow[] = [
      { requisition_id: 'r1', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-01T00:00:00Z' },
      { requisition_id: 'r1', from_stage: 'submitted', to_stage: 'interview', changed_at: '2026-09-06T00:00:00Z' },
      { requisition_id: 'r2', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-01T00:00:00Z' },
    ];
    const reqs = [req({ id: 'r1' }), req({ id: 'r2' })];
    const summary = computeStageDurations(history, reqs, TODAY);
    expect(summary.avgDaysToInterview).toBe(5);
  });

  it('attributes time in a stage from entering it to leaving it', () => {
    const history: StageHistoryRow[] = [
      { requisition_id: 'r1', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-01T00:00:00Z' },
      { requisition_id: 'r1', from_stage: 'submitted', to_stage: 'in_progress', changed_at: '2026-09-04T00:00:00Z' },
      { requisition_id: 'r1', from_stage: 'in_progress', to_stage: 'interview', changed_at: '2026-09-10T00:00:00Z' },
    ];
    const summary = computeStageDurations(history, [req()], TODAY);
    expect(summary.perRequisition[0].stageDurationDays.submitted).toBe(3);
    expect(summary.perRequisition[0].stageDurationDays.in_progress).toBe(6);
  });

  it('counts time still in the current (last) stage up to today, not as zero or missing', () => {
    const history: StageHistoryRow[] = [
      { requisition_id: 'r1', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-25T00:00:00Z' },
    ];
    const summary = computeStageDurations(history, [req()], TODAY);
    expect(summary.perRequisition[0].stageDurationDays.submitted).toBe(7);
  });

  it('aggregates the average stage duration across every requisition that passed through a stage', () => {
    const history: StageHistoryRow[] = [
      { requisition_id: 'r1', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-01T00:00:00Z' },
      { requisition_id: 'r1', from_stage: 'submitted', to_stage: 'in_progress', changed_at: '2026-09-05T00:00:00Z' },
      { requisition_id: 'r2', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-01T00:00:00Z' },
      { requisition_id: 'r2', from_stage: 'submitted', to_stage: 'in_progress', changed_at: '2026-09-03T00:00:00Z' },
    ];
    const reqs = [req({ id: 'r1' }), req({ id: 'r2' })];
    const summary = computeStageDurations(history, reqs, TODAY);
    expect(summary.avgDaysByStage.submitted).toBe(3); // (4 + 2) / 2
  });

  it('never produces a negative duration even with out-of-order or malformed timestamps', () => {
    const history: StageHistoryRow[] = [
      { requisition_id: 'r1', from_stage: null, to_stage: 'submitted', changed_at: '2026-09-05T00:00:00Z' },
      { requisition_id: 'r1', from_stage: 'submitted', to_stage: 'in_progress', changed_at: '2026-09-01T00:00:00Z' },
    ];
    const summary = computeStageDurations(history, [req()], TODAY);
    expect(summary.perRequisition[0].stageDurationDays.submitted).toBeGreaterThanOrEqual(0);
  });

  it('returns an empty-but-valid summary for a requisition with no recorded history at all', () => {
    const summary = computeStageDurations([], [req()], TODAY);
    expect(summary.perRequisition[0].daysToInterview).toBeNull();
    expect(summary.perRequisition[0].stageDurationDays).toEqual({});
  });
});
