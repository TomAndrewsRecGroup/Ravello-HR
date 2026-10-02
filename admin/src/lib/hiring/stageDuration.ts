// Time-to-Interview / Time-to-Offer / Stage-Duration analytics
// (go-live gap list, item 5, 2026-10-02).
//
// requisitions.stage_changed_at (104) only ever held the CURRENT
// stage's own start — the hiring analytics page's one duration metric
// ("Time to Hire") spans the whole pipeline and nothing else. Real
// per-stage durations need a real transition history, which is what
// migration 204's requisition_stage_history table now records
// (forward-looking from 2026-10-02, plus one backfilled row per
// requisition already in flight at that date).
//
// Pure composition over that one table + requisitions.created_at — no
// AI, no score, every number a plain day-count between two real
// timestamps that actually happened.

export interface StageHistoryRow {
  requisition_id: string;
  from_stage: string | null;
  to_stage: string;
  changed_at: string;
}

export interface RequisitionForDuration {
  id: string;
  title: string;
  created_at: string;
}

export interface RequisitionStageDuration {
  requisitionId: string;
  title: string;
  /** Days from the requisition's own creation to the FIRST time it
   *  entered that stage — null if it has never reached that stage. */
  daysToInterview: number | null;
  daysToOffer: number | null;
  daysToFilled: number | null;
  /** Days spent in each stage it has passed through — from entering
   *  to leaving, or to `today` for the stage it is still in. */
  stageDurationDays: Record<string, number>;
}

export interface StageDurationSummary {
  perRequisition: RequisitionStageDuration[];
  /** Average days to reach each milestone, counting only the
   *  requisitions that have actually reached it — a role still
   *  waiting on its first interview is excluded, never counted as 0. */
  avgDaysToInterview: number | null;
  avgDaysToOffer: number | null;
  avgDaysToFilled: number | null;
  /** Average time spent in each stage, across every requisition that
   *  has ever passed through it (open-ended "still in this stage"
   *  spells count up to `today`, so a long-stuck role pulls the
   *  average up rather than being silently excluded). */
  avgDaysByStage: Record<string, number>;
}

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function computeStageDurations(
  history: readonly StageHistoryRow[],
  requisitions: readonly RequisitionForDuration[],
  today: string,
): StageDurationSummary {
  const byReq = new Map<string, StageHistoryRow[]>();
  for (const h of history) {
    const list = byReq.get(h.requisition_id) ?? [];
    list.push(h);
    byReq.set(h.requisition_id, list);
  }
  for (const list of byReq.values()) list.sort((a, b) => a.changed_at.localeCompare(b.changed_at));

  const perRequisition: RequisitionStageDuration[] = [];
  const toInterview: number[] = [];
  const toOffer: number[] = [];
  const toFilled: number[] = [];
  const byStage = new Map<string, number[]>();

  for (const req of requisitions) {
    const transitions = byReq.get(req.id) ?? [];
    const stageDurationDays: Record<string, number> = {};

    for (let i = 0; i < transitions.length; i++) {
      const start = transitions[i].changed_at;
      const end = transitions[i + 1]?.changed_at ?? today;
      const stage = transitions[i].to_stage;
      const d = days(start, end);
      stageDurationDays[stage] = (stageDurationDays[stage] ?? 0) + d;
      const list = byStage.get(stage) ?? [];
      list.push(d);
      byStage.set(stage, list);
    }

    const firstReaching = (stage: string) => transitions.find(t => t.to_stage === stage)?.changed_at ?? null;
    const interviewAt = firstReaching('interview');
    const offerAt = firstReaching('offer');
    const filledAt = firstReaching('filled');

    const daysToInterview = interviewAt ? days(req.created_at, interviewAt) : null;
    const daysToOffer = offerAt ? days(req.created_at, offerAt) : null;
    const daysToFilled = filledAt ? days(req.created_at, filledAt) : null;

    if (daysToInterview != null) toInterview.push(daysToInterview);
    if (daysToOffer != null) toOffer.push(daysToOffer);
    if (daysToFilled != null) toFilled.push(daysToFilled);

    perRequisition.push({ requisitionId: req.id, title: req.title, daysToInterview, daysToOffer, daysToFilled, stageDurationDays });
  }

  const avgDaysByStage: Record<string, number> = {};
  for (const [stage, list] of byStage) avgDaysByStage[stage] = average(list) ?? 0;

  return {
    perRequisition,
    avgDaysToInterview: average(toInterview),
    avgDaysToOffer: average(toOffer),
    avgDaysToFilled: average(toFilled),
    avgDaysByStage,
  };
}
