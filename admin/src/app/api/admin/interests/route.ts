import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBulkBody } from '@/lib/interests/validate';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = parseBulkBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const rows = parsed.value.items.map(it => ({
    athlete_id: parsed.value.athlete_id,
    partner_id: it.partner_id,
    role_opportunity_id: it.role_opportunity_id,
    created_by: auth.userId,
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
