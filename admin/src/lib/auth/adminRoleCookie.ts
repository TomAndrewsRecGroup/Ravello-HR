// The admin app's cached-role cookie, HMAC-signed.
//
// The middleware checks get_my_role() once, then caches the answer in
// `tpo_admin_role` for 15 minutes so every request does not pay for the
// RPC. Until 2026-09-24 that cookie held the bare role string, and both
// the middleware and (admin)/layout.tsx trusted it without a check. Any
// signed-in user — the admin and portal apps share Supabase auth, so
// that is every client user — could set `tpo_admin_role=tps_admin` in
// devtools and load staff pages, several of which read with the
// service-role key.
//
// Now the value is `<b64url payload>.<b64url HMAC-SHA256>`, the same
// shape and Web Crypto approach as portal/src/lib/auth/portalSession.ts.
// The payload binds the role to one user id and an issue time:
//   * a cookie minted for a staff user is refused for anyone else;
//   * an old cookie stops verifying after ROLE_CACHE_SECONDS even if its
//     browser expiry was edited, so revoking a role takes effect within
//     15 minutes;
//   * with ADMIN_SESSION_SECRET unset nothing verifies and nothing is
//     signed, so every request falls back to the RPC. Slower, never open.
//
// Runs on the edge (middleware) and in Node (layouts, route handlers).

export const ADMIN_ROLE_COOKIE = 'tpo_admin_role';

/** Same window the middleware has always cached the role for. */
export const ROLE_CACHE_SECONDS = 60 * 15;

export interface AdminRoleClaims {
  userId: string;
  role:   string;
  /** Issued-at, seconds since epoch. */
  iat:    number;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function secret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || null;
}

async function hmac(key: string, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data as unknown as BufferSource);
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** The signed cookie value, or null when ADMIN_SESSION_SECRET is unset —
 *  the caller must then not set the cookie at all. */
export async function signAdminRole(
  claims: { userId: string; role: string },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const payload = new TextEncoder().encode(
    JSON.stringify({ userId: claims.userId, role: claims.role, iat: nowSeconds }),
  );
  return `${b64urlEncode(payload)}.${b64urlEncode(await hmac(key, payload))}`;
}

/** The claims, only if the signature is valid, the cookie is inside the
 *  cache window, and (when given) it was minted for `expectedUserId`.
 *  Null on anything else — the caller falls back to get_my_role(). */
export async function verifyAdminRole(
  raw: string | null | undefined,
  expectedUserId?: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<AdminRoleClaims | null> {
  if (!raw) return null;
  const key = secret();
  if (!key) return null;

  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return null;

  let payload: Uint8Array;
  let sig: Uint8Array;
  try {
    payload = b64urlDecode(raw.slice(0, dot));
    sig     = b64urlDecode(raw.slice(dot + 1));
  } catch {
    return null;
  }
  if (!timingSafeEqual(sig, await hmac(key, payload))) return null;

  let claims: AdminRoleClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (typeof claims?.userId !== 'string' || typeof claims.role !== 'string' || typeof claims.iat !== 'number') {
    return null;
  }
  if (claims.iat > nowSeconds + 60) return null;                    // issued in the future
  if (nowSeconds - claims.iat > ROLE_CACHE_SECONDS) return null;   // past the cache window
  if (expectedUserId != null && claims.userId !== expectedUserId) return null;
  return claims;
}
