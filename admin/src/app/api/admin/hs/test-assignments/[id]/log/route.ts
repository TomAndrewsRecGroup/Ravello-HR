import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { z, optionalLongText, percentage } from '@/lib/validation/primitives';
import { notify } from '@/lib/notify/notify';

export const runtime = 'nodejs';

// POST /api/admin/hs/test-assignments/[id]/log — staff enters a result
// for a 'link' / 'ms_forms' / 'manual' assignment once it's known.
// Refused for a 'built_in' test: that one marks itself the instant the
// employee submits, and a staff-entered score here would just create a
// second, competing answer for the same assignment (the unique
// constraint on hs_test_submissions.assignment_id would refuse the
// insert anyway, but the clearer failure is explaining why up front).
const Body = z.object({
  passed: z.boolean(),
  score:  percentage.optional().nullable(),
  notes:  optionalLongText(2000),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const params = await props.params;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const supabase = await createServerSupabaseClient();

  const { data: assignment } = await supabase.from('hs_test_assignments')
    .select('id, status, company_id, employee_id, test_id')
    .eq('id', params.id).maybeSingle();
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  if (assignment.status === 'completed') return NextResponse.json({ error: 'Already has a result' }, { status: 400 });

  const [{ data: test }, { data: employee }] = await Promise.all([
    supabase.from('hs_tests').select('source_type, title').eq('id', assignment.test_id).maybeSingle(),
    supabase.from('employee_records').select('full_name').eq('id', assignment.employee_id).maybeSingle(),
  ]);
  if (test?.source_type === 'built_in') {
    return NextResponse.json({ error: 'Built-in tests are marked automatically when the employee submits' }, { status: 400 });
  }

  const { error } = await supabase.from('hs_test_submissions').insert({
    assignment_id: params.id, passed: parsed.data.passed, score: parsed.data.score ?? null, notes: parsed.data.notes,
    recorded_by_kind: 'staff', source: test?.source_type ?? 'manual',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await notify(supabase, {
    audiences: [{ kind: 'company_admins', companyId: assignment.company_id }], companyId: assignment.company_id, type: 'hs_test_result',
    title: `${employee?.full_name ?? 'An employee'}: ${test?.title ?? 'test'} — ${parsed.data.passed ? 'Passed' : 'Failed'}`,
    link: { portal: '/protect/tests' },
    dedupeKey: `hs_test_result:${params.id}`,
  });

  return NextResponse.json({ ok: true });
}
