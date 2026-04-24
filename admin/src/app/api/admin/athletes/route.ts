import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { buildPatch } from '@/lib/athletes/validate';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PostBody {
  company_id?: string;
  full_name?: string;
  email?: string | null;
  sport?: string | null;
  previous_role?: string | null;
  bio?: string | null;
  linkedin_url?: string | null;
  cv_kind?: 'file' | 'text' | null;
  cv_text?: string | null;
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.company_id || !UUID_RE.test(body.company_id)) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  }
  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  }

  const patch = buildPatch(body);
  if ('error' in patch) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('athletes')
    .insert({
      company_id: body.company_id,
      ...patch,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
