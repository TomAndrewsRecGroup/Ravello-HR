import * as cheerio from 'cheerio';
import { assertPublicHost } from '@/lib/net/assertPublicHost';

export interface BrandExtraction {
  source_url: string | null;
  github_css_url: string | null;
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  raw: Record<string, unknown>;
}

const UA = 'Mozilla/5.0 (compatible; RavelloBot/1.0; +https://thepeoplesystem.co.uk)';
const TIMEOUT_MS = 12_000;
const MAX_BYTES  = 3_000_000;

function resolve(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch { return null; }
}

async function fetchText(url: string, accept: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported');
  }
  await assertPublicHost(parsed.hostname, parsed.port ? Number(parsed.port) : undefined, parsed.protocol);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': UA, Accept: accept },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Response exceeds size limit');
  return text;
}

const HEX_RE = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toLowerCase();
}

function normaliseHex(raw: string): string | null {
  const m = raw.match(/^#([0-9a-f]{3,6})$/i);
  if (!m) return null;
  let v = m[1].toLowerCase();
  if (v.length === 3) v = v.split('').map(c => c + c).join('');
  if (v.length !== 6) return null;
  return `#${v}`;
}

// Pull a ranked list of distinct colours from CSS-ish text.
function extractColours(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(HEX_RE)) {
    const hex = normaliseHex(m[0]);
    if (!hex) continue;
    if (hex === '#ffffff' || hex === '#000000') continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  for (const m of text.matchAll(RGB_RE)) {
    const hex = rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
    if (hex === '#ffffff' || hex === '#000000') continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(e => e[0]);
}

const FONT_RE = /font-family\s*:\s*([^;{}\n]+)/gi;

function extractFont(text: string): string | null {
  const m = FONT_RE.exec(text);
  if (!m) return null;
  const first = m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  return first || null;
}

// Convert a github.com blob URL to raw.githubusercontent.com.
// Accepts raw URLs unchanged. Returns null if not a github URL we
// know how to fetch.
export function normaliseGithubCssUrl(input: string): string | null {
  let u: URL;
  try { u = new URL(input); } catch { return null; }
  if (u.hostname === 'raw.githubusercontent.com') return u.toString();
  if (u.hostname === 'github.com') {
    // /owner/repo/blob/branch/path → raw.githubusercontent.com/owner/repo/branch/path
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  }
  return null;
}

export async function extractBrand(opts: {
  url?: string | null;
  githubCssUrl?: string | null;
}): Promise<BrandExtraction> {
  const out: BrandExtraction = {
    source_url: opts.url ?? null,
    github_css_url: opts.githubCssUrl ?? null,
    name: null,
    logo_url: null,
    primary_color: null,
    secondary_color: null,
    accent_color: null,
    font_family: null,
    raw: {},
  };

  // ── HTML pass ──────────────────────────────────────────
  if (opts.url) {
    const html = await fetchText(opts.url, 'text/html,application/xhtml+xml');
    const $ = cheerio.load(html);
    const base = new URL(opts.url);
    const baseStr = `${base.protocol}//${base.host}`;

    const name =
      $('meta[property="og:site_name"]').attr('content')?.trim() ||
      $('meta[name="application-name"]').attr('content')?.trim() ||
      $('head > title').first().text().trim() ||
      null;

    const logoCandidates = [
      $('meta[property="og:logo"]').attr('content'),
      $('link[rel="apple-touch-icon"]').attr('href'),
      $('link[rel="icon"][sizes]').attr('href'),
      $('link[rel="icon"]').attr('href'),
      $('meta[property="og:image"]').attr('content'),
    ];
    const logo_url = logoCandidates
      .map(c => resolve(c ?? undefined, baseStr))
      .find((c): c is string => !!c) ?? null;

    const themeColor = $('meta[name="theme-color"]').attr('content')?.trim() ?? null;

    // Inline <style> blobs + first external stylesheet (best-effort).
    let cssBlob = '';
    $('style').each((_, el) => { cssBlob += '\n' + $(el).text(); });
    const firstCssHref = $('link[rel="stylesheet"]').first().attr('href');
    const firstCssUrl = resolve(firstCssHref ?? undefined, baseStr);
    if (firstCssUrl) {
      try { cssBlob += '\n' + await fetchText(firstCssUrl, 'text/css'); } catch { /* non-fatal */ }
    }

    const colours = extractColours(cssBlob, 8);
    const primary = themeColor && normaliseHex(themeColor) ? normaliseHex(themeColor) : (colours[0] ?? null);
    const secondary = colours.find(c => c !== primary) ?? null;
    const accent = colours.find(c => c !== primary && c !== secondary) ?? null;
    const font = extractFont(cssBlob);

    out.name = name;
    out.logo_url = logo_url;
    out.primary_color = primary;
    out.secondary_color = secondary;
    out.accent_color = accent;
    out.font_family = font;
    out.raw = { theme_color: themeColor, palette: colours };
  }

  // ── GitHub CSS pass (overrides colours/font when supplied) ──
  if (opts.githubCssUrl) {
    const norm = normaliseGithubCssUrl(opts.githubCssUrl);
    if (!norm) throw new Error('Unsupported GitHub URL — provide a raw or blob CSS link');
    const css = await fetchText(norm, 'text/css,text/plain');
    const colours = extractColours(css, 8);
    const font = extractFont(css);
    if (colours[0]) out.primary_color = colours[0];
    if (colours[1]) out.secondary_color = colours[1];
    if (colours[2]) out.accent_color = colours[2];
    if (font) out.font_family = font;
    out.raw = { ...(out.raw as object), github_palette: colours };
  }

  return out;
}
