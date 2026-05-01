import { getPublicSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const revalidate = 600;

const SITE_URL = 'https://thepeoplesystem.co.uk';

function escapeXml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const supabase = getPublicSupabase();
  if (!supabase) {
    return new Response('Feed unavailable', { status: 503 });
  }

  const { data } = await supabase
    .from('latest_updates')
    .select('id, title, description, source_url, site_name, published_at, created_at, image_url')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);

  const items = (data ?? []).map((row) => `
    <item>
      <title>${escapeXml(row.title)}</title>
      <link>${escapeXml(row.source_url)}</link>
      <guid isPermaLink="false">${row.id}</guid>
      <pubDate>${new Date(row.published_at ?? row.created_at).toUTCString()}</pubDate>
      ${row.site_name ? `<source url="${escapeXml(row.source_url)}">${escapeXml(row.site_name)}</source>` : ''}
      ${row.description ? `<description>${escapeXml(row.description)}</description>` : ''}
      ${row.image_url ? `<enclosure url="${escapeXml(row.image_url)}" type="image/jpeg" />` : ''}
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The People System: Latest Updates</title>
    <link>${SITE_URL}/latest-updates</link>
    <description>Curated UK HR news, employment law and workforce updates from The People System.</description>
    <language>en-GB</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/latest-updates/rss.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800',
    },
  });
}
