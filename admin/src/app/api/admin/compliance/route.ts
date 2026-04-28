import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';

// POST /api/admin/compliance
// Create a compliance item for a client. Staff-only.
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: {
    company_id?: string;
    title?:      string;
    description?: string;
    category?:   string;
    due_date?:   string;
    status?:     string;
  } = {};
  try { body = await request.json(); } catch { /* ignore */ }

  if (!body.company_id || !body.title?.trim()) {
    return NextResponse.json({ error: 'company_id and title are required' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('compliance_items')
    .insert({
      company_id:  body.company_id,
      title:       body.title.trim(),
      description: body.description?.trim() || null,
      category:    body.category || 'other',
      due_date:    body.due_date || null,
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
