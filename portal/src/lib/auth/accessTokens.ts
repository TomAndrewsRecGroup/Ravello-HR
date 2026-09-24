import type { SupabaseClient } from '@supabase/supabase-js';

// Single-use set-password links (invites and staff-issued resets).
//
// Until 2026-09-24 the token sat in profiles.invite_token in plain text.
// A client_admin can SELECT their colleagues' profile rows (that is what
// client_profiles_admin_manage is for), so when staff issued a reset to
// an active user, any admin in that company could read the token and
// redeem it at /api/auth/set-password — choosing the colleague's new
// password. And because an unredeemed token was never cleared, "has an
// invite_token" came to mean "pending invite" for ever.
//
// Now: the raw token exists only in the emailed link. The database holds
// its SHA-256 in profile_access_tokens (migration 091), a table with RLS
// on and no policies — nobody but the service role can read it, and a
// hash read would be useless anyway. An account may hold several live
// tokens (a resend does not kill the link already in someone's inbox);
// redeeming any one burns them all.
//
// Shared by both apps (scripts/check-shared-dupes.sh): admin mints,
// portal redeems. Web Crypto only, so it runs anywhere.

export const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AccessTokenPurpose = 'invite' | 'reset';

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The token as it appears in a link, normalised, or null if it is not one. */
export function normaliseAccessToken(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().toLowerCase();
  return TOKEN_RE.test(t) ? t : null;
}

/** SHA-256 hex of the normalised token — what the database stores. */
export async function hashAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Mint a token for a profile. Returns the RAW token (for the link) or an error. */
export async function mintAccessToken(
  service: SupabaseClient,
  profileId: string,
  purpose: AccessTokenPurpose,
  createdBy: string | null = null,
  now: number = Date.now(),
): Promise<{ token: string; expiresAt: string } | { error: string }> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(now + ACCESS_TOKEN_TTL_MS).toISOString();
  const { error } = await service.from('profile_access_tokens').insert({
    token_hash: await hashAccessToken(token),
    profile_id: profileId,
    purpose,
    expires_at: expiresAt,
    created_by: createdBy,
  });
  if (error) return { error: error.message };
  return { token, expiresAt };
}

/** Look a token up without using it (the set-password page, before the form). */
export async function peekAccessToken(
  service: SupabaseClient,
  raw: string | null | undefined,
  now: number = Date.now(),
): Promise<{ profileId: string; expiresAt: string } | 'expired' | null> {
  const token = normaliseAccessToken(raw);
  if (!token) return null;
  const { data } = await service
    .from('profile_access_tokens')
    .select('profile_id, expires_at')
    .eq('token_hash', await hashAccessToken(token))
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= now) return 'expired';
  return { profileId: data.profile_id, expiresAt: data.expires_at };
}

/**
 * Use a token. Atomic and single-use: the DELETE … RETURNING is the
 * claim, so of two concurrent redemptions only one gets the row. Every
 * other token for the same account is then burned too.
 */
export async function redeemAccessToken(
  service: SupabaseClient,
  raw: string | null | undefined,
  now: number = Date.now(),
): Promise<{ profileId: string } | { error: string } | null> {
  const token = normaliseAccessToken(raw);
  if (!token) return null;
  const { data, error } = await service
    .from('profile_access_tokens')
    .delete()
    .eq('token_hash', await hashAccessToken(token))
    .gt('expires_at', new Date(now).toISOString())
    .select('profile_id');
  if (error) return { error: error.message };
  const claimed = (data ?? [])[0] as { profile_id: string } | undefined;
  if (!claimed) return null;
  await service.from('profile_access_tokens').delete().eq('profile_id', claimed.profile_id);
  return { profileId: claimed.profile_id };
}
