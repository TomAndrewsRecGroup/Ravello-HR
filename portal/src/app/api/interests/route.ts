import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { parseBulkBody } from '@/lib/interests/validate';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { user, companyId } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!companyId) {
    return NextResponse.json({ error: 'no company' }, { status: 403 });
  }

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = parseBulkBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = createServerSupabaseClient();
  // Verify the target athlete belongs to the caller's company.
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id, company_id')
    .eq('id', parsed.value.athlete_id)
    .single();
  if (!athlete || athlete.company_id !== companyId) {
    return NextResponse.json({ error: 'athlete not found' }, { status: 404 });
  }

  const rows = parsed.value.items.map(it => ({
    athlete_id: parsed.value.athlete_id,
    partner_id: it.partner_id,
    role_opportunity_id: it.role_opportunity_id,
    created_by: user.id,
  }));

  const { data, error } = await supabase
    .from('athlete_partner_interests')
    .upsert(rows, {
      onConflict: 'athlete_id,partner_id,role_opportunity_id',
      ignoreDuplicates: true,
    })
    .select('id, athlete_id, partner_id, role_opportunity_id, status, notes, created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: data?.length ?? 0, rows: data ?? [] });
}
