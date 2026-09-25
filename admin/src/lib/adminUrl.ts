/**
 * Canonical URL of the admin app, where Core OS 360 staff and external
 * Health & Safety providers sign in.
 *
 * A provider (role hs_provider) has no company and no portal pages: the
 * portal's middleware sends them here, and the shared set-password page
 * hands them on here once their password is set. `NEXT_PUBLIC_ADMIN_URL`
 * overrides; a leading www. and trailing slashes are stripped, as for
 * the admin app's portalUrl().
 */
const FALLBACK = 'https://admin.thepeoplesystem.co.uk';

export function adminUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_ADMIN_URL ?? FALLBACK).trim().replace(/\/+$/, '');
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') return FALLBACK;
    if (u.hostname.startsWith('www.')) u.hostname = u.hostname.slice(4);
    return u.toString().replace(/\/+$/, '');
  } catch {
    return FALLBACK;
  }
}
