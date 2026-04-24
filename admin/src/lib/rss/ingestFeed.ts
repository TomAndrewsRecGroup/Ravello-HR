import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicaliseUrl, urlHash } from '@/lib/og/canonicaliseUrl';
import { fetchFeed } from './fetchFeed';

interface FeedSourceRow {
  id: string;
  slug: string;
  display_name: string;
  feed_url: string;
  source_type: 'rss' | 'html' | 'manual';
  category: string | null;
  active: boolean;
}

export interface IngestResult {
  source_id: string;
  slug: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  error: string | null;
}

const MAX_ITEMS_PER_FEED = 25;

export async function ingestFeed(
  supabase: SupabaseClient,
  source: FeedSourceRow,
): Promise<IngestResult> {
  const result: IngestResult = {
    source_id: source.id,
    slug: source.slug,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    error: null,
  };

  if (source.source_type !== 'rss') {
    result.error = `Unsupported source_type: ${source.source_type}`;
    return result;
  }

  let parsed;
  try {
    parsed = await fetchFeed(source.feed_url);
  } catch (e) {
    result.error = (e as Error).message.slice(0, 500);
    await supabase
      .from('feed_sources')
      .update({ last_fetched_at: new Date().toISOString(), last_error: result.error })
      .eq('id', source.id);
    return result;
  }

  const items = parsed.items.slice(0, MAX_ITEMS_PER_FEED);
  result.fetched = items.length;

  for (const item of items) {
    let canonical: string;
    let hash: string;
    try {
      canonical = canonicaliseUrl(item.url);
      hash = urlHash(item.url);
    } catch {
      result.skipped++;
      continue;
    }

    const { data: existing } = await supabase
      .from('latest_updates')
      .select('id, source_type')
      .eq('url_hash', hash)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      continue;
    }

    const { error } = await supabase.from('latest_updates').insert({
      source_type: 'rss',
      feed_source_id: source.id,
      source_url: canonical,
      url_hash: hash,
      title: item.title.slice(0, 500),
      description: item.description,
      image_url: item.image_url,
      site_name: item.site_name ?? parsed.feed_title ?? source.display_name,
      author: item.author,
      published_at: item.published_at,
      render_mode: 'card',
      embed_html: null,
      status: 'published',
      featured: false,
      raw: item.raw,
    });

    if (error) {
      if (error.code === '23505') {
        result.skipped++;
      } else {
        result.error = error.message.slice(0, 500);
        break;
      }
    } else {
      result.inserted++;
    }
  }

  await supabase
    .from('feed_sources')
    .update({
      last_fetched_at: new Date().toISOString(),
      last_error: result.error,
    })
    .eq('id', source.id);

  return result;
}
