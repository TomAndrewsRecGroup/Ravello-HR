import { createHash } from 'crypto';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_reader', 'utm_name', 'utm_social', 'utm_social-type',
  'fbclid', 'gclid', 'dclid', 'mc_cid', 'mc_eid', 'yclid', 'msclkid',
  '_hsenc', '_hsmi', 'hsCtaTracking', 'ref', 'ref_src', 'ref_url',
  'source', 'campaign',
];

export function canonicaliseUrl(input: string): string {
  const u = new URL(input.trim());
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();

  for (const p of TRACKING_PARAMS) u.searchParams.delete(p);

  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '');
  }

  u.searchParams.sort();
  return u.toString();
}

export function urlHash(url: string): string {
  return createHash('sha256').update(canonicaliseUrl(url)).digest('hex');
}
