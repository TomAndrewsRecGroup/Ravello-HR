import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// POST /api/broadcast
// Creates an action item for each selected company.
// Body: { company_ids: string[], title: string, description?: string,
//         action_type: string, priority: string, due_date?: string }

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify requester is ravello staff
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  const role = (profile as any)?.role ?? '';
  if (!['ravello_admin', 'ravello_recruiter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { company_ids, title, description, action_type, priority, due_date } = body;

  if (!company_ids?.length || !title || !action_type || !priority) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const rows = (company_ids as string[]).map((company_id: string) => ({
    company_id,
    title,
    description:         description || null,
    action_type,
    priority,
    due_date:            due_date || null,
    status:              'active',
    created_by_admin:    true,
  }));

  const { data, error } = await supabase.from('actions').insert(rows).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ created: data?.length ?? 0 });
}
