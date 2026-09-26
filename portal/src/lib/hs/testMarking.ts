// Auto-marking for a 'built_in' test (migration 116) — the only source
// type this platform ever marks itself; see 116's own header comment
// for why 'link'/'ms_forms'/'manual' results are entered by whoever
// administered them instead. Pure, unit-tested: the same function marks
// a live submission and the runner's own "how am I doing" preview, so
// the two can never disagree — mirrors lib/hs/auditScore.ts's posture.

export interface HsTestOption {
  id: string;
  label: string;
}

export interface HsTestQuestion {
  id: string;
  prompt: string;
  options: HsTestOption[];
  correct_option_id: string;
}

export interface MarkResult {
  score: number;         // 0-100, rounded
  correctCount: number;
  totalCount: number;
}

/** Only ever trust an answer that names a REAL option of that question —
 *  never the raw jsonb a caller sent. An unanswered or malformed entry
 *  is simply absent, which marks as wrong; it never throws. */
export function sanitiseAnswers(questions: HsTestQuestion[], raw: Record<string, unknown> | null | undefined): Record<string, string> {
  const answers = raw ?? {};
  const out: Record<string, string> = {};
  for (const q of questions) {
    const a = answers[q.id];
    if (typeof a === 'string' && q.options.some(o => o.id === a)) out[q.id] = a;
  }
  return out;
}

export function markBuiltInTest(questions: HsTestQuestion[], rawAnswers: Record<string, unknown> | null | undefined): MarkResult {
  const totalCount = questions.length;
  if (totalCount === 0) return { score: 0, correctCount: 0, totalCount: 0 };
  const answers = sanitiseAnswers(questions, rawAnswers);
  const correctCount = questions.filter(q => answers[q.id] === q.correct_option_id).length;
  return { score: Math.round((correctCount / totalCount) * 100), correctCount, totalCount };
}
