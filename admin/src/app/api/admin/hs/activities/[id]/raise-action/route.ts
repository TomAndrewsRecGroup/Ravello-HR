import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { enumOf, optionalIsoDate, optionalLongText, shortText, uuid, z } from '@/lib/validation/primitives';

// POST /api/admin/hs/activities/[id]/raise-action — the one click that
// turns a "follow-up suggested" notification into a client action.
// Staff only, under the staff session (the actions staff policy
// allows the insert). Jev never reaches this route: a person does.

export const runtime = 'nodejs';

const Body = z.object({
  title:       shortText(200),
  description: optionalLongText(4_000),
  priority:    enumOf(['low', 'normal', 'high', 'urgent']),
  due_date:    optionalIsoDate,
  decision_id: uuid.optional().nullable(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const supabase = await createServerSupabaseClient();
  const { data: activity, error: readErr } = await supabase.from('hs_activities').select('id, company_id, title').eq('id', params.id).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });

  const { data: action, error } = await supabase.from('actions').upsert({
    company_id: (activity as { company_id: string }).company_id,
    source_ref: `hs_activity:${params.id}`,
    status: 'active', action_type: 'hs_followup', created_by_admin: true,
    title: parsed.data.title, description: parsed.data.description ?? null, priority: parsed.data.priority,
    due_date: parsed.data.due_date ?? null,
    related_entity_type: 'hs_activity', related_entity_id: params.id,
  }, { onConflict: 'company_id,source_ref', ignoreDuplicates: true }).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.decision_id) {
    await supabase.from('jev_decisions').update({ human_outcome: 'accepted' }).eq('id', parsed.data.decision_id).select('id');
  }
  return NextResponse.json({ ok: true, action_id: (action as { id: string } | null)?.id ?? null, already: !action });
}
