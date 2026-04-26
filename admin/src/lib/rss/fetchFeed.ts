import Parser from 'rss-parser';
import { assertPublicHost } from '@/lib/net/assertPublicHost';

export interface ParsedFeedItem {
  url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  author: string | null;
  published_at: string | null;
  raw: Record<string, unknown>;
}

export interface ParsedFeed {
  feed_title: string | null;
  items: ParsedFeedItem[];
}

interface CustomFeed { title?: string }
interface CustomItem {
  'media:content'?: { $?: { url?: string } } | Array<{ $?: { url?: string } }>;
  'media:thumbnail'?: { $?: { url?: string } } | Array<{ $?: { url?: string } }>;
  enclosure?: { url?: string };
  'content:encoded'?: string;
  creator?: string;
  'dc:creator'?: string;
  author?: string;
}

const parser = new Parser<CustomFeed, CustomItem>({
  timeout: 10_000,
  headers: { 'User-Agent': 'RavelloBot/1.0 (+https://thepeoplesystem.co.uk)' },
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
      ['content:encoded', 'content:encoded'],
      ['dc:creator', 'dc:creator'],
    ],
  },
});

function firstUrl(
  node: { $?: { url?: string } } | Array<{ $?: { url?: string } }> | undefined,
): string | null {
  if (!node) return null;
  if (Array.isArray(node)) return node[0]?.$?.url ?? null;
  return node.$?.url ?? null;
}

function stripHtml(s: string | undefined | null): string | null {
  if (!s) return null;
  const text = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text.slice(0, 500) : null;
}

function imageFromHtml(html: string | undefined | null): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

export async function fetchFeed(feedUrl: string): Promise<ParsedFeed> {
  const parsed = new URL(feedUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) feed URLs are supported');
  }
  await assertPublicHost(parsed.hostname);

  const feed = await parser.parseURL(feedUrl);
  const items: ParsedFeedItem[] = [];

  for (const it of feed.items ?? []) {
    const url = (it.link ?? '').trim();
    if (!url) continue;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    } catch { continue; }

    const image =
      firstUrl(it['media:content']) ??
      firstUrl(it['media:thumbnail']) ??
      it.enclosure?.url ??
      imageFromHtml(it['content:encoded']) ??
      imageFromHtml(it.content) ??
      null;

    const description =
      stripHtml(it.contentSnippet) ??
      stripHtml(it.summary) ??
      stripHtml(it['content:encoded']) ??
      stripHtml(it.content) ??
      null;

    const pub = it.isoDate ?? it.pubDate ?? null;
    const published_at = pub ? new Date(pub).toISOString() : null;

    items.push({
      url,
      title: (it.title ?? '').trim() || url,
      description,
      image_url: image,
      site_name: feed.title ?? null,
      author: it.creator ?? it['dc:creator'] ?? it.author ?? null,
      published_at,
      raw: { guid: it.guid, categories: it.categories },
    });
  }

  return { feed_title: feed.title ?? null, items };
}
