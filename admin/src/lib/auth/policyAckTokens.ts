import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken, normaliseAccessToken } from './accessTokens';

// Employee policy-acknowledgement links (migration 103). The raw token
// exists only in the emailed link; the database holds its SHA-256 in
// policy_ack_tokens, service role only. Unlike a set-password token a
// link is NOT single-use on open: the employee opens it, reads the
// document, and comes back to acknowledge. It is burned, with every
// other link for the same row, when the row is acknowledged.
//
// Shared by both apps (scripts/check-shared-dupes.sh): admin's consumer
// mints, the portal's public route peeks and redeems.

export const POLICY_ACK_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function mintPolicyAckToken(
  service: SupabaseClient,
  acknowledgementId: string,
  now: number = Date.now(),
): Promise<{ token: string; tokenHash: string; expiresAt: string } | { error: string }> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(now + POLICY_ACK_TOKEN_TTL_MS).toISOString();
  const tokenHash = await hashAccessToken(token);
  const { error } = await service.from('policy_ack_tokens').insert({ token_hash: tokenHash, acknowledgement_id: acknowledgementId, expires_at: expiresAt });
  if (error) return { error: error.message };
  return { token, tokenHash, expiresAt };
}

/** Look a link up without using it (the page, before the button). */
export async function peekPolicyAckToken(
  service: SupabaseClient,
  raw: string | null | undefined,
  now: number = Date.now(),
): Promise<{ acknowledgementId: string; expiresAt: string } | 'expired' | null> {
  const token = normaliseAccessToken(raw);
  if (!token) return null;
  const { data } = await service.from('policy_ack_tokens').select('acknowledgement_id, expires_at')
    .eq('token_hash', await hashAccessToken(token)).maybeSingle();
  const row = data as { acknowledgement_id: string; expires_at: string } | null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= now) return 'expired';
  return { acknowledgementId: row.acknowledgement_id, expiresAt: row.expires_at };
}

/** Every link for a row, gone (after acknowledging), or every link but
 *  one (after a fresh one was emailed: the superseded links die, the
 *  one in the newest email works). */
export async function burnPolicyAckTokens(service: SupabaseClient, acknowledgementId: string, exceptTokenHash?: string): Promise<void> {
  let q = service.from('policy_ack_tokens').delete().eq('acknowledgement_id', acknowledgementId);
  if (exceptTokenHash) q = q.neq('token_hash', exceptTokenHash);
  await q;
}

/** Remove one link (a mint that was never emailed). */
export async function discardPolicyAckToken(service: SupabaseClient, tokenHash: string): Promise<void> {
  await service.from('policy_ack_tokens').delete().eq('token_hash', tokenHash);
}

/**
 * Acknowledge through a link. The UPDATE is conditional on the row
 * still being open (pending or overdue) and counted, so two clicks
 * acknowledge once; the tokens are burned either way once the row is
 * signed.
 */
export async function redeemPolicyAckToken(
  service: SupabaseClient,
  raw: string | null | undefined,
  now: number = Date.now(),
  evidence: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ acknowledgementId: string; already: boolean } | 'expired' | { error: string } | null> {
  const peek = await peekPolicyAckToken(service, raw, now);
  if (peek === null || peek === 'expired') return peek;
  // Evidence of HOW it was signed (Core-OS 360 Phase 1, migration 119):
  // the request's IP and user agent, bounded to the column CHECKs, and
  // the method. The document VERSION signed is stamped by the database
  // (policy_ack_fill), never taken from here.
  const { error, count } = await service.from('policy_acknowledgements')
    .update({
      status: 'acknowledged', acknowledged_at: new Date(now).toISOString(), acknowledged_via: 'link',
      ip_address: evidence.ip ? evidence.ip.slice(0, 64) : null,
      user_agent: evidence.userAgent ? evidence.userAgent.slice(0, 500) : null,
      auth_evidence: { method: 'emailed_single_person_link' },
    }, { count: 'exact' })
    .eq('id', peek.acknowledgementId).in('status', ['pending', 'overdue']);
  if (error) return { error: error.message };
  await burnPolicyAckTokens(service, peek.acknowledgementId);
  return { acknowledgementId: peek.acknowledgementId, already: (count ?? 0) === 0 };
}
