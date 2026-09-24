// Core OS 360 brand, shared byte-for-byte by admin and portal
// (scripts/check-shared-dupes.sh). The product was The People System
// until 2026-09-24; every logo, favicon and product name now comes from
// here, so the next rename is one file.
//
// The DOMAIN is deliberately unchanged (operator, 2026-09-24): portal /
// admin URLs, the noreply sending address, Resend's verified domain and
// every athlete and partner referral link still live on
// thepeoplesystem.co.uk. Only the name and the artwork changed.
//
// Assets live in each app's public/brand/ and were generated from the
// brand mockups (full mark >= 112px, simplified mark below that; text in
// the lockups is outlined Unbounded, so nothing depends on a web font).

export const BRAND_NAME = 'Core OS 360';
export const BRAND_TAGLINE = 'Workforce OS';

/** Horizontal lockup (mark + wordmark) for light backgrounds. */
export const BRAND_LOGO = '/brand/core-os-360-logo.svg';
/** Horizontal lockup for dark backgrounds. */
export const BRAND_LOGO_DARK = '/brand/core-os-360-logo-dark.svg';
/** Width / height of both horizontal lockups (viewBox 4672 x 1000). */
export const BRAND_LOGO_RATIO = 4.672;
/** The mark alone. The simplified mark is for anything drawn under 112px. */
export const BRAND_MARK = '/brand/core-os-360-mark.svg';
export const BRAND_MARK_SIMPLE = '/brand/core-os-360-mark-simple.svg';

/** Email clients do not render SVG, and Resend flags an image hosted off
 *  the sending root domain, so the email logo is a PNG on the portal's
 *  own (thepeoplesystem.co.uk) host. */
export const BRAND_EMAIL_LOGO_URL = 'https://portal.thepeoplesystem.co.uk/brand/core-os-360-email.png';

/** Sender used when EMAIL_FROM is unset. Same address as before the rebrand. */
export const BRAND_DEFAULT_FROM = `${BRAND_NAME} <noreply@portal.thepeoplesystem.co.uk>`;

/**
 * EMAIL_FROM lives in Vercel and may still carry the old display name
 * ("The People System <noreply@…>"). Swapping ONLY a pre-rebrand display
 * name keeps the address — and so Resend's verified domain — exactly as
 * configured, while no email goes out under the old name. Anything else
 * (a person's name, a bare address) is returned untouched.
 */
export function brandFromAddress(from: string | null | undefined): string {
  if (!from) return BRAND_DEFAULT_FROM;
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m && /people\s*system|^tps$/i.test(m[1].trim())) return `${BRAND_NAME} <${m[2].trim()}>`;
  return from;
}

/** Set by the login form just before it navigates in; the app layout
 *  reads it to render the sign-in intro (components/brand/BrandIntro)
 *  in the first paint, and the intro clears it. Short-lived by design. */
export const BRAND_INTRO_COOKIE = 'cos360_intro';
