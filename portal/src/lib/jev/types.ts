// Jev (TypeSafe AI): typed decisions, never text.
//
// Jev answers three kinds of question about a `state` and returns
// probabilities. It cannot write, summarise or draft — which is exactly
// why it is the one model this platform calls: a probability over a
// fixed option list is checkable, loggable and cheap; a paragraph is
// none of those.
//
// Wire shape (verified against the independent jev-evaluation repo's
// wire.py, 2026-09-25; docs.typesafe.ai is egress-blocked from this
// sandbox, so lib/jev/transport.ts keeps the mapping in ONE place and
// records the raw response on every call, so a mismatch shows on
// /automation instead of silently acting):
//
//   POST {JEV_API_URL}  Authorization: Bearer JEV_API_KEY
//   { model, state, questions: { <key>: { type, instructions?, criteria } } }
//     noul   criteria { true: '…', false: '…' }
//     choice criteria { <option_id>: '<description>' }   (1–255)
//     score  criteria [ '<label>', … ]                    (ordered)
//   → { answers: { <key>: { type, noul } | { type, choice, confidence, probabilities }
//                          | { type, score, confidence, legend, probabilities } },
//       model, usage: { input_tokens, output_tokens } }

export type JevQuestion =
  | { type: 'noul';   instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score';  instructions: string; criteria: readonly string[] };

export type JevQuestions = Record<string, JevQuestion>;

export type JevAnswer =
  | { type: 'noul';   probability: number }
  | { type: 'choice'; selected: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score';  selected: string; index: number; confidence: number; probabilities: Record<string, number> };

export type JevAnswers = Record<string, JevAnswer>;

/** Every place Jev is asked something. Add here, then in DECISION_KINDS. */
export const DECISION_KINDS = [
  'hs_item_classify',
  'hs_register_rank',
  'hs_activity_followup',
  'absence_pattern',
  'onboarding_risk',
  'doc_type_suggest',
  'sr_triage',
  'enquiry_intent',
  'bd_next_action',
  'candidate_feedback_reason',
] as const;
export type DecisionKind = typeof DECISION_KINDS[number];

/** Which kinds may ACT without a person confirming. Anything whose
 *  state carries text a client, provider or the public wrote is a
 *  recommendation only — an authority claim in a ticket moved Jev's
 *  verdict 147 times in 200. Ordering a digest is the only auto-act
 *  today, and it changes no row. jevPolicy.test.ts pins this. */
export const AUTO_ACT_KINDS: ReadonlySet<DecisionKind> = new Set<DecisionKind>(['hs_register_rank', 'bd_next_action']);

export interface JevResult {
  decisionId: string | null;
  answers:    JevAnswers;
  /** Lowest confidence across choice/score answers (noul has none). */
  confidence: number | null;
  /** True when confidence fell below the gate: show as "unsure", never act. */
  gated:      boolean;
  model:      string | null;
  inputTokens: number | null;
  cached:     boolean;
}
