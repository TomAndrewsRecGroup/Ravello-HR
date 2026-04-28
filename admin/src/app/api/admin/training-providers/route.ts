import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { normaliseTrainingOfferings } from '@/lib/training/offerings';
import { normaliseWebsite } from '@/lib/partners/roleOpportunities';

export const runtime = 'nodejs';

interface PostBody {
  provider_name?: string;
  locations?: string | null;
  category?: string | null;
  website?: string | null;
  offerings?: unknown;
  active?: boolean;
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const provider_name = (body.provider_name ?? '').trim();
  if (!provider_name) {
    return NextResponse.json({ error: 'provider_name is required' }, { status: 400 });
  }

  const offerings = normaliseTrainingOfferings(body.offerings, []);
  if (!offerings.ok) return NextResponse.json({ error: offerings.error }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('training_providers')
    .insert({
      provider_name: provider_name.slice(0, 200),
      locations: body.locations?.trim()?.slice(0, 500) || null,
      category: body.category?.trim()?.slice(0, 200) || null,
      website: normaliseWebsite(body.website),
      offerings: offerings.value,
      active: body.active ?? true,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
