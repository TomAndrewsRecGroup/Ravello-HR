import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { z, uuid, shortText, optionalShortText, optionalLongText, optionalIsoDate } from '@/lib/validation/primitives';
import { sendTestInvite } from '@/lib/hs/testInvite';

// POST /api/admin/hs/tests/[id]/sessions — the batch/cohort action: one
// session, any number of employees spanning any number of client
// companies, every link minted and emailed in this one call. This is
// the "multiple people from numerous clients on the same day" path.
//
// Cohort entries name their own company_id (not derived from the
// employee, though it should always agree) so a malformed pairing 404s
// per-row rather than silently filing someone under the wrong client.

export const runtime = 'nodejs';

const CohortEntry = z.object({ company_id: uuid, employee_id: uuid });

const Body = z.object({
  title:        shortText(200),
  scheduled_on: optionalIsoDate,
  notes:        optionalLongText(2000),
  cohort:       z.array(CohortEntry).min(1).max(500),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const params = await props.params;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;
  const supabase = await createServerSupabaseClient();

  const { data: test } = await supabase.from('hs_tests').select('id, active').eq('id', params.id).maybeSingle();
  if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

  const { data: session, error: sessionErr } = await supabase.from('hs_test_sessions').insert({
    test_id: params.id, title: b.title, scheduled_on: b.scheduled_on, notes: b.notes, created_by: auth.userId,
  }).select('id').single();
  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });

  const rows = b.cohort.map(c => ({
    session_id: session.id, test_id: params.id, company_id: c.company_id, employee_id: c.employee_id, created_by: auth.userId,
  }));
  const { data: assignments, error: assignErr } = await supabase.from('hs_test_assignments').insert(rows).select('id');
  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

  const tally = { sent: 0, no_email: 0, failed: 0, already: 0, not_found: 0 };
  for (const a of assignments ?? []) {
    const r = await sendTestInvite(supabase, a.id, `test_invite:${a.id}`);
    tally[r.outcome]++;
  }

  return NextResponse.json({ session_id: session.id, assigned: assignments?.length ?? 0, tally });
}
