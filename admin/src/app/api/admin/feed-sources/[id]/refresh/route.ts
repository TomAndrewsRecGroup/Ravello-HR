import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { ingestFeed } from '@/lib/rss/ingestFeed';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: source, error } = await supabase
    .from('feed_sources')
    .select('id, slug, display_name, feed_url, source_type, category, active')
    .eq('id', params.id)
    .single();

  if (error || !source) {
    return NextResponse.json({ error: 'Feed source not found' }, { status: 404 });
  }

  const result = await ingestFeed(supabase, source);
  return NextResponse.json({ result });
}
