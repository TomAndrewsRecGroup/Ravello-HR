import * as cheerio from 'cheerio';
import { promises as dns } from 'dns';
import type { ParsedFeedItem } from '../rss/fetchFeed';

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

export interface ScrapeConfig {
  list_url?: string;
  item: string;
  title?: string;
  link?: string;
  link_attr?: string;
  image?: string;
  image_attr?: string;
  date?: string;
  date_attr?: string;
  description?: string;
  base_url?: string;
}

const DEFAULTS = {
  title: 'h1, h2, h3, h4',
  link: 'a',
  link_attr: 'href',
  image: 'img',
  image_attr: 'src',
  date: 'time',
  date_attr: 'datetime',
  description: 'p',
} as const;

function resolveUrl(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function fetchHtml(
  pageUrl: string,
  config: ScrapeConfig,
): Promise<{ items: ParsedFeedItem[]; site_title: string | null }> {
  const parsed = new URL(pageUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported');
  }
  await assertPublicHost(parsed.hostname);

  const res = await fetch(pageUrl, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RavelloBot/1.0; +https://thepeoplesystem.co.uk)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (html.length > 5_000_000) throw new Error('Response exceeds 5MB limit');

  const $ = cheerio.load(html);
  const base = config.base_url ?? `${parsed.protocol}//${parsed.host}`;
  const siteTitle = $('head > title').first().text().trim() || null;

  const items: ParsedFeedItem[] = [];
  $(config.item).each((_, el) => {
    const $el = $(el);

    const linkSel = config.link ?? DEFAULTS.link;
    const linkAttr = config.link_attr ?? DEFAULTS.link_attr;
    const $link = linkSel === ':self' ? $el : $el.find(linkSel).first();
    const href = ($link.attr(linkAttr) ?? $link.attr('href') ?? '').trim();
    const url = resolveUrl(href, base);
    if (!url) return;

    const titleSel = config.title ?? DEFAULTS.title;
    const title = ($el.find(titleSel).first().text() || $link.text() || '').trim();

    const imageSel = config.image ?? DEFAULTS.image;
    const imageAttr = config.image_attr ?? DEFAULTS.image_attr;
    const $img = $el.find(imageSel).first();
    const imgRaw = $img.attr(imageAttr) ?? $img.attr('src') ?? $img.attr('data-src');
    const image = resolveUrl(imgRaw ?? undefined, base);

    const dateSel = config.date ?? DEFAULTS.date;
    const dateAttr = config.date_attr ?? DEFAULTS.date_attr;
    const $date = $el.find(dateSel).first();
    const dateRaw = $date.attr(dateAttr) ?? $date.text();
    const published_at = parseDate(dateRaw);

    const descSel = config.description ?? DEFAULTS.description;
    const descRaw = $el.find(descSel).first().text().trim();
    const description = descRaw ? descRaw.replace(/\s+/g, ' ').slice(0, 500) : null;

    if (!title && !description) return;

    items.push({
      url,
      title: (title || url).slice(0, 500),
      description,
      image_url: image,
      site_name: siteTitle,
      author: null,
      published_at,
      raw: { scraped_from: pageUrl },
    });
  });

  return { items, site_title: siteTitle };
}
