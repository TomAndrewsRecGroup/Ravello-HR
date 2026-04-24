import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildPatch, type AthleteFields } from '@/lib/athletes/validate';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadCompanyAthlete(supabase: ReturnType<typeof createServerSupabaseClient>, athleteId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) {
    return { error: NextResponse.json({ error: 'no company' }, { status: 403 }) };
  }
  const { data: athlete } = await supabase
    .from('athletes').select('id, company_id').eq('id', athleteId).single();
  if (!athlete || athlete.company_id !== profile.company_id) {
    return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  }
  return { user, athlete };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const guard = await loadCompanyAthlete(supabase, params.id);
  if ('error' in guard) return guard.error;

  let body: AthleteFields;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const patch = buildPatch(body);
  if ('error' in patch) return NextResponse.json({ error: patch.error }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from('athletes').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const guard = await loadCompanyAthlete(supabase, params.id);
  if ('error' in guard) return guard.error;

  const { error } = await supabase.from('athletes').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
