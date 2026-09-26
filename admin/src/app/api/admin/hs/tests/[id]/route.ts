import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { judgeWrite, COUNT_EXACT } from '@/lib/supabase/mutations';
import { z, shortText, optionalShortText, optionalLongText, optionalHttpsUrl, percentage } from '@/lib/validation/primitives';

export const runtime = 'nodejs';

// PATCH /api/admin/hs/tests/[id] — edit a test's metadata, or archive it
// (active:false). source_type is deliberately NOT editable here: it
// decides how a submission is marked, and every existing assignment's
// invite email and any live token page already assume the source that
// was true when they were sent — changing it under a live session would
// silently change what the runner shows someone mid-way through.
const Body = z.object({
  title:              shortText(200).optional(),
  description:        optionalLongText(4000).optional(),
  category:           optionalShortText(100).optional(),
  external_url:       optionalHttpsUrl.optional(),
  pass_mark:          percentage.optional().nullable(),
  certifies_training: z.boolean().optional(),
  recert_months:      z.number().int().min(1).max(120).optional().nullable(),
  active:             z.boolean().optional(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const params = await props.params;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const res = await supabase.from('hs_tests').update({ ...parsed.data, updated_at: new Date().toISOString() }, COUNT_EXACT).eq('id', params.id);
  const w = judgeWrite({ error: res.error, count: res.count });
  if (!w.ok) return NextResponse.json({ error: w.message }, { status: 404 });
  return NextResponse.json({ ok: true });
}
