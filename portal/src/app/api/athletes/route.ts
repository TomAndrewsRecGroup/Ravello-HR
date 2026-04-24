import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildPatch } from '@/lib/athletes/validate';

export const runtime = 'nodejs';

interface PostBody {
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
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) {
    return NextResponse.json({ error: 'no company assigned to profile' }, { status: 403 });
  }

  let body: PostBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  }

  const patch = buildPatch(body);
  if ('error' in patch) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('athletes')
    .insert({
      company_id: profile.company_id,
      ...patch,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
