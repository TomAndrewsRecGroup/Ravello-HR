import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';

export const runtime = 'nodejs';

interface PostBody {
  slug: string;
  display_name: string;
  feed_url: string;
  category?: string | null;
  active?: boolean;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = (body.slug ?? '').trim().toLowerCase();
  const display_name = (body.display_name ?? '').trim();
  const feed_url = (body.feed_url ?? '').trim();

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'Slug must be 3-50 chars, lowercase letters/digits/hyphens' },
      { status: 400 },
    );
  }
  if (!display_name) {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 });
  }
  try {
    const u = new URL(feed_url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    return NextResponse.json({ error: 'feed_url must be a valid http(s) URL' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('feed_sources')
    .insert({
      slug,
      display_name,
      feed_url,
      source_type: 'rss',
      category: body.category?.trim() || null,
      active: body.active ?? true,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
