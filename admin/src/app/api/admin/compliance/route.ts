import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBody } from '@/lib/validation/parseBody';
import { z, uuid, shortText, optionalLongText, isoDate, enumOf } from '@/lib/validation/primitives';
import { COMPLIANCE_CATEGORIES, COMPLIANCE_STATUSES } from '@/lib/ui/statusMaps';

const Body = z.object({
  company_id:  uuid,
  title:       shortText(200),
  description: optionalLongText(2000),
  category:    enumOf(COMPLIANCE_CATEGORIES).optional(),
  due_date:    isoDate,
  status:      enumOf(COMPLIANCE_STATUSES).optional(),
});

// POST /api/admin/compliance
// Create a compliance item for a client. Staff-only.
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // H&S items belong on the dedicated register (recurrence, evidence,
  // the Safety Timeline), which this generic form has none of — the
  // schema's category enum excludes 'health_safety' entirely, so a
  // request naming it fails validation with that reason.
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('compliance_items')
    .insert({
      company_id:  body.company_id,
      title:       body.title,
      description: body.description,
      category:    body.category || 'other',
      due_date:    body.due_date,
      status:      body.status || 'pending',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/compliance');
  revalidatePath('/dashboard');
  revalidateTag(`client:${body.company_id}`);

  return NextResponse.json({ id: data.id });
}
