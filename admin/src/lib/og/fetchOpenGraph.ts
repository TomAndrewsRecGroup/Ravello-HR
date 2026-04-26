import ogs from 'open-graph-scraper';
import { assertPublicHost } from '@/lib/net/assertPublicHost';

export interface OgResult {
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  author: string | null;
  published_at: string | null;
  raw: Record<string, unknown>;
}

export async function fetchOpenGraph(url: string): Promise<OgResult> {
  const parsed = new URL(url);
  await assertPublicHost(parsed.hostname);

  const { result } = await ogs({
    url,
    fetchOptions: {
      signal: AbortSignal.timeout(5000),
      headers: { 'user-agent': 'RavelloBot/1.0 (+https://thepeoplesystem.co.uk)' },
    },
  });

  const r = result as Record<string, unknown>;
  const image = (r.ogImage as Array<{ url?: string }> | undefined)?.[0]?.url
    ?? (r.twitterImage as Array<{ url?: string }> | undefined)?.[0]?.url
    ?? null;

  return {
    title: (r.ogTitle as string) ?? (r.twitterTitle as string) ?? (r.dcTitle as string) ?? null,
    description: (r.ogDescription as string) ?? (r.twitterDescription as string) ?? null,
    image_url: image,
    site_name: (r.ogSiteName as string) ?? null,
    author: (r.author as string) ?? (r.articleAuthor as string) ?? null,
    published_at: (r.articlePublishedTime as string) ?? (r.ogArticlePublishedTime as string) ?? null,
    raw: r,
  };
}

export function isLinkedInUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'linkedin.com' || h.endsWith('.linkedin.com');
  } catch {
    return false;
  }
}

// Extracts the numeric activity ID from a LinkedIn post URL. The
// public site renders a fixed iframe template around this ID — we
// deliberately never store HTML in the DB.
export function extractLinkedInActivityId(url: string): string | null {
  const m = url.match(/activity[-:]?(\d{10,})/i) ?? url.match(/urn:li:activity:(\d+)/i);
  return m ? m[1] : null;
}
