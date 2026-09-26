import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken, normaliseAccessToken } from '../auth/accessTokens';

// No-login test-taking links (migration 116) — the exact same shape as
// policy_ack_tokens (103): the raw token exists only in the emailed
// link, the database holds its SHA-256, RLS is on with NO policies at
// all (service role only). Not single-use on open: the employee can
// open the link, read the instructions, and come back. It is burned,
// with every other link for the same assignment, once a submission is
// recorded — see lib/hs/testSubmission.ts, which is where the actual
// insert+burn happens (this file only ever touches hs_test_tokens).
//
// Shared by both apps (scripts/check-shared-dupes.sh): admin's session-
// creation route mints, the portal's public route peeks and (via
// testSubmission.ts) burns.

export const TEST_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days — a session may be booked well ahead

export async function mintTestToken(
  service: SupabaseClient,
  assignmentId: string,
  now: number = Date.now(),
): Promise<{ token: string; tokenHash: string; expiresAt: string } | { error: string }> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(now + TEST_TOKEN_TTL_MS).toISOString();
  const tokenHash = await hashAccessToken(token);
  const { error } = await service.from('hs_test_tokens').insert({ token_hash: tokenHash, assignment_id: assignmentId, expires_at: expiresAt });
  if (error) return { error: error.message };
  return { token, tokenHash, expiresAt };
}

/** Look a link up without using it (the page, before any submission). */
export async function peekTestToken(
  service: SupabaseClient,
  raw: string | null | undefined,
  now: number = Date.now(),
): Promise<{ assignmentId: string; expiresAt: string } | 'expired' | null> {
  const token = normaliseAccessToken(raw);
  if (!token) return null;
  const { data } = await service.from('hs_test_tokens').select('assignment_id, expires_at')
    .eq('token_hash', await hashAccessToken(token)).maybeSingle();
  const row = data as { assignment_id: string; expires_at: string } | null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= now) return 'expired';
  return { assignmentId: row.assignment_id, expiresAt: row.expires_at };
}

/** Every link for an assignment, gone (after a submission), or every
 *  link but one (after a fresh resend). */
export async function burnTestTokens(service: SupabaseClient, assignmentId: string, exceptTokenHash?: string): Promise<void> {
  let q = service.from('hs_test_tokens').delete().eq('assignment_id', assignmentId);
  if (exceptTokenHash) q = q.neq('token_hash', exceptTokenHash);
  await q;
}

/** Remove one link (a mint that was never emailed). */
export async function discardTestToken(service: SupabaseClient, tokenHash: string): Promise<void> {
  await service.from('hs_test_tokens').delete().eq('token_hash', tokenHash);
}
