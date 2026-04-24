import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UUID_RE, parsePatch } from '@/lib/interests/validate';

export const runtime = 'nodejs';

async function ensureOwn(supabase: ReturnType<typeof createServerSupabaseClient>, interestId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) {
    return { error: NextResponse.json({ error: 'no company' }, { status: 403 }) };
  }
  const { data: row } = await supabase
    .from('athlete_partner_interests')
    .select('id, athletes!inner(company_id)')
    .eq('id', interestId)
    .single();
  const ownedCompany = (row as { athletes?: { company_id?: string } } | null)?.athletes?.company_id;
  if (!row || ownedCompany !== profile.company_id) {
    return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  }
  return { ok: true as const };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const guard = await ensureOwn(supabase, params.id);
  if ('error' in guard) return guard.error;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const patch = parsePatch(raw);
  if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 });

  const { error } = await supabase
    .from('athlete_partner_interests')
    .update(patch.value)
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const guard = await ensureOwn(supabase, params.id);
  if ('error' in guard) return guard.error;

  const { error } = await supabase
    .from('athlete_partner_interests')
    .delete()
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
