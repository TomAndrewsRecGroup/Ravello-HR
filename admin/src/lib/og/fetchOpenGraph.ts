import ogs from 'open-graph-scraper';
import { promises as dns } from 'dns';

const PRIVATE_IP_RE = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^::1$/,
  /^fe80:/i,
  /^f[cd][0-9a-f]{2}:/i,
];

async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === 'localhost' || hostname === '0.0.0.0') {
    throw new Error('Refusing to fetch local host');
  }
  const addresses = await dns.lookup(hostname, { all: true });
  for (const a of addresses) {
    if (PRIVATE_IP_RE.some(re => re.test(a.address))) {
      throw new Error(`Refusing to fetch private IP ${a.address}`);
    }
  }
}

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

export function buildLinkedInEmbed(url: string): string | null {
  const m = url.match(/activity[-:]?(\d{10,})/i) ?? url.match(/urn:li:activity:(\d+)/i);
  if (!m) return null;
  const activityId = m[1];
  return `<iframe src="https://www.linkedin.com/embed/feed/update/urn:li:activity:${activityId}" height="600" width="100%" frameborder="0" allowfullscreen title="Embedded LinkedIn post"></iframe>`;
}
