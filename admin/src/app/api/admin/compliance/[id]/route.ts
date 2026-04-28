import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx { params: { id: string } }

// PATCH /api/admin/compliance/[id]
// Update a compliance item. Body can include any subset of:
//   title, description, category, due_date, status, notes
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const patch: Record<string, unknown> = {};
  if ('title'       in body) patch.title       = String(body.title ?? '').trim() || null;
  if ('description' in body) patch.description = body.description ? String(body.description).trim() : null;
  if ('category'    in body) patch.category    = body.category;
  if ('due_date'    in body) patch.due_date    = body.due_date || null;
  if ('status'      in body) patch.status      = body.status;
  if ('notes'       in body) patch.notes       = body.notes ? String(body.notes).trim() : null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
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
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
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
