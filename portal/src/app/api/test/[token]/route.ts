import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { normaliseAccessToken } from '@/lib/auth/accessTokens';
import { peekTestToken } from '@/lib/hs/testTokens';
import { submitBuiltInTest } from '@/lib/hs/testSubmission';
import { emitEvent } from '@/lib/events/emit';
import { parseBody } from '@/lib/validation/parseBody';
import { z } from '@/lib/validation/primitives';
import type { HsTestQuestion } from '@/lib/hs/testMarking';

// Public, token-authenticated test-taking (the employee has no portal
// login — same security model as /api/leave/[token] and
// /api/policy/[token]). One token link works for every source type:
//
//   GET  /api/test/{token} → who, which test, what to do about it
//                            (a built_in quiz's questions with the
//                            answer key stripped, or an external link /
//                            "your result will be logged" copy).
//   POST /api/test/{token} → only ever marks a built_in test. A
//                            link/ms_forms/manual assignment has
//                            nothing this route can complete — its
//                            result comes from staff, in the admin app.

const ipGetLimiter  = createRateLimiter({ windowMs: 5 * 60_000, max: 30 });
const ipPostLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

// Never send the answer key to the browser.
function publicQuestions(questions: HsTestQuestion[] | null | undefined) {
  return (questions ?? []).map(q => ({
    id: q.id, prompt: q.prompt,
    options: q.options.map(o => ({ id: o.id, label: o.label })),
  }));
}

async function loadAssignment(sb: ReturnType<typeof createServiceSupabaseClient>, assignmentId: string) {
  const { data: assignment } = await sb.from('hs_test_assignments')
    .select('id, status, test_id, employee_id, company_id').eq('id', assignmentId).maybeSingle();
  if (!assignment) return null;
  const [{ data: test }, { data: employee }, { data: company }] = await Promise.all([
    sb.from('hs_tests').select('title, description, source_type, external_url, questions').eq('id', assignment.test_id).maybeSingle(),
    sb.from('employee_records').select('full_name, status').eq('id', assignment.employee_id).maybeSingle(),
    sb.from('companies').select('name').eq('id', assignment.company_id).maybeSingle(),
  ]);
  return { assignment, test, employee, company };
}

export async function GET(request: NextRequest, props: Ctx) {
  const params = await props.params;
  if (!ipGetLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!normaliseAccessToken(params.token)) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const sb = createServiceSupabaseClient();
  const peek = await peekTestToken(sb, params.token);
  if (peek === null) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (peek === 'expired') return NextResponse.json({ error: 'This link has expired. Ask your employer to send a new one.' }, { status: 410 });

  const loaded = await loadAssignment(sb, peek.assignmentId);
  if (!loaded || !loaded.employee || !loaded.test) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (loaded.employee.status === 'terminated') return NextResponse.json({ error: 'This link is no longer active' }, { status: 410 });

  return NextResponse.json({
    employee: { name: loaded.employee.full_name },
    company:  { name: loaded.company?.name ?? '' },
    test: {
      title: loaded.test.title,
      description: loaded.test.description,
      source_type: loaded.test.source_type,
      external_url: loaded.test.external_url,
      questions: loaded.test.source_type === 'built_in' ? publicQuestions(loaded.test.questions) : null,
    },
    status: loaded.assignment.status,
  });
}

const SubmitBody = z.object({ answers: z.record(z.unknown()).default({}) });

export async function POST(request: NextRequest, props: Ctx) {
  const params = await props.params;
  if (!ipPostLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!normaliseAccessToken(params.token)) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const sb = createServiceSupabaseClient();
  const peek = await peekTestToken(sb, params.token);
  if (peek === null) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (peek === 'expired') return NextResponse.json({ error: 'This link has expired. Ask your employer to send a new one.' }, { status: 410 });

  const parsed = await parseBody(request, SubmitBody);
  if (!parsed.ok) return parsed.response;

  const loaded = await loadAssignment(sb, peek.assignmentId);
  if (!loaded || !loaded.employee || !loaded.test) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (loaded.employee.status === 'terminated') return NextResponse.json({ error: 'This link is no longer active' }, { status: 410 });

  const result = await submitBuiltInTest(sb, peek.assignmentId, parsed.data.answers);
  if (result.outcome === 'not_found') return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (result.outcome === 'already') return NextResponse.json({ error: 'This test has already been submitted.' }, { status: 400 });
  if (result.outcome === 'not_built_in') return NextResponse.json({ error: 'This test is not submitted here — your result will be logged once it is known.' }, { status: 400 });
  if (result.outcome === 'error') return NextResponse.json({ error: result.error }, { status: 500 });

  await emitEvent(sb, {
    companyId: loaded.assignment.company_id, entityType: 'hs_test_submission', entityId: loaded.assignment.id,
    eventType: 'created', actorKind: 'client',
    dedupeKey: `hs_test_submission:${loaded.assignment.id}`,
    payload: { employee_name: loaded.employee.full_name, test_title: loaded.test.title, passed: result.passed, score: result.score },
  });

  return NextResponse.json({ success: true, score: result.score, passed: result.passed, correctCount: result.correctCount, totalCount: result.totalCount });
}
