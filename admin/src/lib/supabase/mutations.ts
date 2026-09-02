// Did the write actually change anything?
//
// A supabase UPDATE that matches NO ROWS returns `error: null`. RLS
// silently refusing a write, or an id that no longer exists, is
// therefore indistinguishable from success — the caller sees no error,
// flips its local state, and shows a green tick over a row that never
// changed.
//
// This is not hypothetical. On 2026-09-02 a headcount of 100 was typed
// into the requisition panel, saved, and re-published; the panel showed
// "Saved — re-publish to push to Manatal", and null reached Manatal.
// The publish route had the same shape and could have reported a
// published role while `manatal_published_at` never moved.
//
// `{ count: 'exact' }` is the cheap way to ask. It sets
// `Prefer: count=exact` and returns the affected-row count WITHOUT
// sending the rows back, so it costs a header rather than a payload —
// which matters on the writes that touch a wide row.

export interface CountedResult {
  error: { message: string } | null;
  count: number | null;
}

export interface WriteOutcome {
  ok:      boolean;
  matched: number;
  /** Ready to show a person. Null when the write succeeded. */
  message: string | null;
}

/**
 * Judge a counted write.
 *
 * `count: null` is NOT treated as a failure. PostgREST only returns a
 * count when asked for one, and a caller that forgot the option would
 * otherwise see every write reported as refused — a guard that cries
 * wolf gets deleted, and then the real defect comes back. Callers that
 * need certainty pass the option; this reports what it was given.
 */
export function judgeWrite(res: CountedResult, what = 'The change'): WriteOutcome {
  if (res.error) {
    return { ok: false, matched: 0, message: res.error.message };
  }
  if (res.count === 0) {
    return {
      ok: false,
      matched: 0,
      message: `${what} was not saved — the update matched no rows. You may not have permission, or the record may have been deleted.`,
    };
  }
  return { ok: true, matched: res.count ?? 1, message: null };
}

/** The options object every UPDATE that reports success to a person
 *  should pass, so `judgeWrite` has a count to judge. */
export const COUNT_EXACT = { count: 'exact' } as const;
