/**
 * Canonical portal URL for emailed links.
 *
 * The portal is deployed at `portal.thepeoplesystem.co.uk` (no www).
 * `NEXT_PUBLIC_PORTAL_URL` is the override but operators have set
 * it with `www.` in front before — that hostname either doesn't
 * exist in DNS or points at a deployment without the right env
 * vars, so the activate page bails out with `?error=config`.
 *
 * This helper strips a leading `www.` and any trailing slash so
 * every email link uses the canonical host regardless of env-var
 * formatting.
 */
const FALLBACK = 'https://portal.thepeoplesystem.co.uk';

export function portalUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_PORTAL_URL ?? FALLBACK).trim();
  let normalised = raw.replace(/\/+$/, '');
  try {
    const u = new URL(normalised);
    if (u.hostname.startsWith('www.')) {
      u.hostname = u.hostname.slice(4);
    }
    normalised = u.toString().replace(/\/+$/, '');
  } catch {
    // Malformed env var: fall back rather than crash the route.
    return FALLBACK;
  }
  return normalised;
}
