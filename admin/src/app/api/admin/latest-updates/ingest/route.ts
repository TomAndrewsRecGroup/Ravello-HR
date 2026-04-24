import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { canonicaliseUrl, urlHash } from '@/lib/og/canonicaliseUrl';
import { fetchOpenGraph, isLinkedInUrl, buildLinkedInEmbed } from '@/lib/og/fetchOpenGraph';

export const runtime = 'nodejs';

interface Body {
  url: string;
  render_mode?: 'card' | 'embed';
  title_override?: string;
  description_override?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  let canonical: string;
  let hash: string;
  try {
    canonical = canonicaliseUrl(body.url);
    hash = urlHash(body.url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const renderMode: 'card' | 'embed' = body.render_mode === 'embed' ? 'embed' : 'card';
  const isLinkedIn = isLinkedInUrl(canonical);

  let og: Awaited<ReturnType<typeof fetchOpenGraph>> | null = null;
  if (!(renderMode === 'embed' && isLinkedIn)) {
    try {
      og = await fetchOpenGraph(canonical);
    } catch (err) {
      console.warn('[latest-updates/ingest] OG fetch failed', (err as Error).message);
    }
  }

  const title = body.title_override?.trim()
    || og?.title?.trim()
    || (() => {
      try { return new URL(canonical).hostname; } catch { return canonical; }
    })();

  const description = body.description_override?.trim() ?? og?.description ?? null;

  const embed_html = renderMode === 'embed' && isLinkedIn
    ? buildLinkedInEmbed(canonical)
    : null;

  if (renderMode === 'embed' && isLinkedIn && !embed_html) {
    return NextResponse.json(
      { error: 'Could not extract LinkedIn activity ID from URL' },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('latest_updates')
    .upsert(
      {
        source_type: 'manual',
        source_url: canonical,
        url_hash: hash,
        title,
        description,
        image_url: og?.image_url ?? null,
        site_name: og?.site_name ?? null,
        author: og?.author ?? null,
        published_at: og?.published_at ?? null,
        render_mode: renderMode,
        embed_html,
        status: 'published',
        raw: og?.raw ?? null,
        created_by: auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'url_hash' },
    )
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
