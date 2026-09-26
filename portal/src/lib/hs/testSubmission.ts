import type { SupabaseClient } from '@supabase/supabase-js';
import { markBuiltInTest, sanitiseAnswers, type HsTestQuestion } from './testMarking';
import { burnTestTokens } from './testTokens';

// The one place a built_in test is ever self-submitted (the public
// token route). 'link'/'ms_forms'/'manual' assignments are never
// completed here — those are logged by staff from the admin app, per
// 116's own header comment on why the marking split exists.
//
// company_id/employee_id/test_id/source/recorded_by_kind and, for a
// built_in test, `passed` itself are all recomputed by the DB's
// hs_test_submission_fill() trigger regardless of what this sends —
// this function's own score computation is for the reply to the
// employee (and the runner's "how did I do" screen), not something the
// database trusts blindly.

export type SubmitOutcome =
  | { outcome: 'submitted'; score: number; passed: boolean; correctCount: number; totalCount: number }
  | { outcome: 'already' }
  | { outcome: 'not_built_in' }
  | { outcome: 'not_found' }
  | { outcome: 'error'; error: string };

export async function submitBuiltInTest(
  sb: SupabaseClient,
  assignmentId: string,
  rawAnswers: Record<string, unknown> | null | undefined,
): Promise<SubmitOutcome> {
  const { data: assignment } = await sb.from('hs_test_assignments')
    .select('id, status, test_id').eq('id', assignmentId).maybeSingle();
  if (!assignment) return { outcome: 'not_found' };
  if (assignment.status === 'completed') return { outcome: 'already' };

  const { data: test } = await sb.from('hs_tests')
    .select('source_type, questions, pass_mark').eq('id', assignment.test_id).maybeSingle();
  if (!test || test.source_type !== 'built_in') return { outcome: 'not_built_in' };

  const questions = (Array.isArray(test.questions) ? test.questions : []) as HsTestQuestion[];
  const { score, correctCount, totalCount } = markBuiltInTest(questions, rawAnswers);
  const answers = sanitiseAnswers(questions, rawAnswers);

  const { data: inserted, error } = await sb.from('hs_test_submissions').insert({
    assignment_id: assignmentId, score, passed: false, answers,
  }).select('passed').single();
  if (error) return { outcome: 'error', error: error.message };

  await burnTestTokens(sb, assignmentId);
  return { outcome: 'submitted', score, passed: !!inserted?.passed, correctCount, totalCount };
}
