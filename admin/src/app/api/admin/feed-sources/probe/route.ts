import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { fetchFeed } from '@/lib/rss/fetchFeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProbeResult {
  ok:           true;
  /** Suggested display name from <channel><title>. Falls back to the URL host. */
  display_name: string;
  /** Suggested slug, derived from the URL host. */
  slug:         string;
  /** Best-guess category from feed-level keywords / item categories. */
  category:     string | null;
  /** First image we can find across the first few items. */
  preview_image_url: string | null;
  /** Number of items in the feed. */
  item_count:   number;
  /** First three items so the operator can sanity-check the feed before saving. */
  preview_items: Array<{
    title:        string;
    description:  string | null;
    image_url:    string | null;
    published_at: string | null;
    url:          string;
  }>;
}

interface ProbeError {
  ok:    false;
  error: string;
}

/**
 * Map a free-text channel/category string to one of our canonical
 * category labels. Loose match — operators can override.
 */
function inferCategory(samples: Array<string | null | undefined>): string | null {
  const blob = samples.filter(Boolean).join(' | ').toLowerCase();
  if (!blob) return null;
  if (/(employment law|tribunal|legal|legislation|policy|gdpr|ico)/.test(blob)) return 'Employment Law';
  if (/(recruit|talent|hir(e|ing)|sourcing|candidate|ats)/.test(blob))            return 'Recruitment';
  if (/(leader|management|exec|coaching|culture)/.test(blob))                     return 'Leadership';
  if (/(workforce|labour market|ons|statistic|data|salary|pay)/.test(blob))       return 'Workforce Data';
  if (/(learn|training|l&d|skills|capability|development)/.test(blob))            return 'Learning & Development';
  if (/(news|update|insight|trend|brief)/.test(blob))                             return 'HR News';
  return 'HR Insight';
}

function slugify(host: string): string {
  return host
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: { url?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const raw = (body.url ?? '').trim();
  if (!raw) {
    return NextResponse.json<ProbeError>({ ok: false, error: 'URL required' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(raw);
  } catch {
    return NextResponse.json<ProbeError>({ ok: false, error: 'Invalid URL' }, { status: 400 });
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return NextResponse.json<ProbeError>({ ok: false, error: 'Only http(s) URLs are supported' }, { status: 400 });
  }

  try {
    const parsed = await fetchFeed(raw);

    const itemCount = parsed.items.length;
    if (itemCount === 0) {
      return NextResponse.json<ProbeError>({
        ok: false,
        error: 'Feed parsed but contained no usable items. The URL may be the website homepage, not the RSS/Atom XML feed.',
      }, { status: 422 });
    }

    const previewItems = parsed.items.slice(0, 3).map((it) => ({
      title:        it.title,
      description:  it.description,
      image_url:    it.image_url,
      published_at: it.published_at,
      url:          it.url,
    }));

    const previewImage = parsed.items.find((it) => it.image_url)?.image_url ?? null;

    // Extract category samples for inference.
    const categorySources: Array<string | null | undefined> = [
      parsed.feed_title,
      ...parsed.items.slice(0, 5).map((it) => (it.raw?.categories as string[] | undefined)?.join(' ')),
    ];

    const result: ProbeResult = {
      ok:                true,
      display_name:      (parsed.feed_title ?? parsedUrl.hostname.replace(/^www\./, '')).trim(),
      slug:              slugify(parsedUrl.hostname),
      category:          inferCategory(categorySources),
      preview_image_url: previewImage,
      item_count:        itemCount,
      preview_items:     previewItems,
    };

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Fetch failed';
    return NextResponse.json<ProbeError>({
      ok: false,
      error: `Could not parse the feed: ${message}`,
    }, { status: 422 });
  }
}
