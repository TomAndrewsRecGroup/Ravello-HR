import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBody } from '@/lib/validation/parseBody';
import { z, shortText, optionalLongText, optionalIsoDate, enumOf } from '@/lib/validation/primitives';
import { COMPLIANCE_CATEGORIES, COMPLIANCE_STATUSES } from '@/lib/ui/statusMaps';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx { params: Promise<{ id: string }> }

// Every field optional: the route accepts any subset. Category is
// deliberately its own enum, not COMPLIANCE_CATEGORIES, so historical
// rows can still round-trip 'health_safety' through this route (the
// refusal below only blocks writing that value, never reading it back).
const Body = z.object({
  title:       shortText(200).optional(),
  description: optionalLongText(2000),
  category:    z.enum([...COMPLIANCE_CATEGORIES, 'health_safety']).optional(),
  due_date:    optionalIsoDate,
  status:      enumOf(COMPLIANCE_STATUSES).optional(),
  notes:       optionalLongText(2000),
});

// PATCH /api/admin/compliance/[id]
// Update a compliance item. Body can include any subset of:
//   title, description, category, due_date, status, notes
export async function PATCH(request: NextRequest, props: Ctx) {
  const params = await props.params;
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (body.category === 'health_safety') {
    return NextResponse.json({ error: 'Move this to the client\'s H&S register instead of the generic category.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.title       !== undefined) patch.title       = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.category    !== undefined) patch.category    = body.category;
  if (body.due_date    !== undefined) patch.due_date    = body.due_date;
  if (body.status      !== undefined) patch.status      = body.status;
  if (body.notes       !== undefined) patch.notes       = body.notes;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('compliance_items')
    .update(patch)
    .eq('id', params.id)
    .select('company_id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 500 });
  }

  revalidatePath('/compliance');
  revalidatePath('/dashboard');
  revalidateTag(`client:${data.company_id}`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/compliance/[id]
export async function DELETE(_request: NextRequest, props: Ctx) {
  const params = await props.params;
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from('compliance_items')
    .select('company_id')
    .eq('id', params.id)
    .maybeSingle();

  const { error } = await supabase
    .from('compliance_items')
    .delete()
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/compliance');
  revalidatePath('/dashboard');
  if (existing?.company_id) revalidateTag(`client:${existing.company_id}`);
  return NextResponse.json({ ok: true });
}
