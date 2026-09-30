import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken } from '@/lib/auth/accessTokens';

// Worker QR badges (Core-OS 360 Phase 14, migration 179). Unlike every
// other token table in this codebase (profile_access_tokens,
// policy_ack_tokens, hs_test_tokens — all single-use, burned on
// redemption), this token is DURABLE: a badge must stay scannable
// indefinitely. What stays the same: the raw token exists only at mint
// time (in this response) — the database holds its SHA-256 only, in
// worker_qr_tokens, RLS on with no session policies (service role
// only), so there is no "look the badge back up" path. Losing a badge
// means regenerating one, the same way a real ID card would be
// reissued rather than reprinted from a stored copy.
//
// company_id, and the "at most one active badge per person" rule, are
// both enforced by the migration's own trigger and partial unique
// index — this file never re-derives either, it only calls the table.

const FALLBACK_PORTAL_URL = 'https://portal.thepeoplesystem.co.uk';

/** The absolute URL a badge's QR code encodes. */
export function workerQrUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_PORTAL_URL ?? FALLBACK_PORTAL_URL).trim().replace(/\/+$/, '');
  return `${base}/w/${token}`;
}

export interface MintedBadge {
  token: string;
  tokenHash: string;
}

/**
 * Revokes any existing active badge for this person, then mints a new
 * one. The revoke-first step is a convenience — the DB's own partial
 * unique index (`worker_qr_tokens_one_active_per_person`) would refuse
 * a second active row regardless, so a caller that skips straight to
 * insert without revoking first simply gets a 23505, never a silent
 * second active badge.
 */
export async function mintWorkerQrToken(
  service: SupabaseClient,
  personId: string,
  actorUserId: string | null,
): Promise<MintedBadge | { error: string }> {
  const token = crypto.randomUUID();
  const tokenHash = await hashAccessToken(token);

  const { error: revokeErr } = await service.from('worker_qr_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_by: actorUserId }, { count: 'exact' })
    .eq('person_id', personId).is('revoked_at', null);
  if (revokeErr) return { error: revokeErr.message };

  const { error: insertErr } = await service.from('worker_qr_tokens')
    .insert({ person_id: personId, token_hash: tokenHash, created_by: actorUserId });
  if (insertErr) return { error: insertErr.message };

  return { token, tokenHash };
}

/** Revokes the person's current active badge, if any. Idempotent. */
export async function revokeWorkerQrToken(
  service: SupabaseClient,
  personId: string,
  actorUserId: string | null,
): Promise<{ revoked: boolean } | { error: string }> {
  const { error, count } = await service.from('worker_qr_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_by: actorUserId }, { count: 'exact' })
    .eq('person_id', personId).is('revoked_at', null);
  if (error) return { error: error.message };
  return { revoked: (count ?? 0) > 0 };
}

/** Whether this person currently holds an active badge — never the
 *  token itself, which cannot be read back once minted (see above). */
export async function hasActiveWorkerQrToken(service: SupabaseClient, personId: string): Promise<boolean> {
  const { data } = await service.from('worker_qr_tokens')
    .select('id').eq('person_id', personId).is('revoked_at', null).maybeSingle();
  return data != null;
}
