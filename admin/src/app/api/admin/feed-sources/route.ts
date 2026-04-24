import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';

export const runtime = 'nodejs';

interface PostBody {
  slug: string;
  display_name: string;
  feed_url: string;
  source_type?: 'rss' | 'html';
  category?: string | null;
  active?: boolean;
  scrape_config?: unknown;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

function validateScrapeConfig(raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'scrape_config must be a JSON object' };
  }
  const c = raw as Record<string, unknown>;
  if (typeof c.item !== 'string' || !c.item.trim()) {
    return { ok: false, error: 'scrape_config.item (CSS selector) is required' };
  }
  return { ok: true, value: c };
}

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
  const source_type = body.source_type === 'html' ? 'html' : 'rss';

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

  let scrape_config: Record<string, unknown> | null = null;
  if (source_type === 'html') {
    const v = validateScrapeConfig(body.scrape_config);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    scrape_config = v.value;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('feed_sources')
    .insert({
      slug,
      display_name,
      feed_url,
      source_type,
      category: body.category?.trim() || null,
      active: body.active ?? true,
      scrape_config,
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
