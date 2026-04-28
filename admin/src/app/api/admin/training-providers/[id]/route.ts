import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { normaliseTrainingOfferings, type TrainingOffering } from '@/lib/training/offerings';
import { normaliseWebsite } from '@/lib/partners/roleOpportunities';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PatchBody {
  provider_name?: string;
  locations?: string | null;
  category?: string | null;
  website?: string | null;
  offerings?: unknown;
  active?: boolean;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: PatchBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.provider_name !== undefined) {
    const v = body.provider_name.trim();
    if (!v) return NextResponse.json({ error: 'provider_name cannot be empty' }, { status: 400 });
    patch.provider_name = v.slice(0, 200);
  }
  if (body.locations !== undefined) patch.locations = body.locations?.trim()?.slice(0, 500) || null;
  if (body.category !== undefined) patch.category = body.category?.trim()?.slice(0, 200) || null;
  if (body.website !== undefined) patch.website = body.website ? normaliseWebsite(body.website) : null;
  if (body.active !== undefined) patch.active = !!body.active;

  if (body.offerings !== undefined) {
    const { data: existing } = await supabase
      .from('training_providers')
      .select('offerings')
      .eq('id', params.id)
      .single();
    const existingOfferings = (existing?.offerings as TrainingOffering[] | null) ?? [];
    const offerings = normaliseTrainingOfferings(body.offerings, existingOfferings);
    if (!offerings.ok) return NextResponse.json({ error: offerings.error }, { status: 400 });
    patch.offerings = offerings.value;
  }

  const { error } = await supabase.from('training_providers').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from('training_providers').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
