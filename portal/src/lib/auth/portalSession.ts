// HMAC-signed session-cookie helpers used by the portal middleware
// and getSessionProfile().
//
// The cookie value is a base64url JSON payload joined to a base64url
// HMAC-SHA256 signature with a single '.' separator:
//
//   <payload>.<sig>
//
// On read, we verify the sig before trusting any of payload's claims
// (companyId, role, isTpsStaff, etc.). Without this, an attacker
// holding a valid auth.users session can hand-craft the JSON cookie
// and impersonate any company / claim staff override.
//
// Runs on edge (middleware) and Node (getSessionProfile) — uses
// Web Crypto everywhere.

export interface PortalSessionPayload {
  userId:               string;
  email?:               string | null;
  role:                 string;
  companyId:            string;
  isTpsStaff:           boolean;
  uiPreferences?:       Record<string, unknown>;
  onboardingCompleted?: boolean;
  featureFlags?:        Record<string, boolean>;
  fullName?:            string | null;
  /** Issued-at (seconds). Lets us reject pre-rotation cookies if we ever
   *  have to invalidate every active session. */
  iat?:                 number;
}

const COOKIE_NAME = 'tps_portal_session';

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getSecret(): string | null {
  return process.env.PORTAL_SESSION_SECRET || null;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function hmac(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await importKey(secret);
  // Cast through `BufferSource`: TS strict typings flag Uint8Array's
  // underlying ArrayBufferLike as 'maybe SharedArrayBuffer' which is
  // not assignable to BufferSource. The runtime contract is fine —
  // crypto.subtle.sign accepts any TypedArray.
  const sig = await crypto.subtle.sign('HMAC', key, data as unknown as BufferSource);
  return new Uint8Array(sig);
}

/** Constant-time comparison for two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const PORTAL_SESSION_COOKIE = COOKIE_NAME;

/**
 * Build the signed cookie value. Returns null if the env secret is
 * unset — the caller should treat that as a hard failure (don't
 * stamp an unsigned cookie, force the user back through auth).
 */
export async function signPortalSession(payload: PortalSessionPayload): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const json = JSON.stringify({ ...payload, iat: payload.iat ?? Math.floor(Date.now() / 1000) });
  const payloadBytes = new TextEncoder().encode(json);
  const sigBytes     = await hmac(secret, payloadBytes);
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(sigBytes)}`;
}

/**
 * Verify a signed cookie value. Returns the payload only if the
 * signature is valid AND the signing secret is configured. Returns
 * null on any tamper/missing-secret/parse failure — the caller MUST
 * fall through to a fresh auth round-trip in that case.
 */
export async function verifyPortalSession(raw: string | undefined | null): Promise<PortalSessionPayload | null> {
  if (!raw) return null;
  const secret = getSecret();
  if (!secret) return null;

  const dot = raw.indexOf('.');
  if (dot < 0) return null;
  const payloadPart = raw.slice(0, dot);
  const sigPart     = raw.slice(dot + 1);
  if (!payloadPart || !sigPart) return null;

  let payloadBytes: Uint8Array;
  let sigBytes:     Uint8Array;
  try {
    payloadBytes = b64urlDecode(payloadPart);
    sigBytes     = b64urlDecode(sigPart);
  } catch { return null; }

  const expectedSig = await hmac(secret, payloadBytes);
  if (!timingSafeEqual(sigBytes, expectedSig)) return null;

  try {
    const json = new TextDecoder().decode(payloadBytes);
    return JSON.parse(json) as PortalSessionPayload;
  } catch { return null; }
}
