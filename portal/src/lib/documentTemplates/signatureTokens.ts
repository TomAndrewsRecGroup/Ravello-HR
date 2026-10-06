import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken, normaliseAccessToken } from '@/lib/auth/accessTokens';

// document_signature_tokens (213): the no-login signing link, the exact
// policy_ack_tokens (103) shape — SHA-256 hash only, RLS-on-no-policies
// (service role only), so there is no "look the link back up" path.
// Unlike worker_qr_tokens (durable), this is single-use: burned on
// sign/decline, enforced in the application layer the same way
// policy_ack_tokens' own burn-on-sign is, since this table has no
// session policy to enforce it in SQL at all. An instance may hold
// several live tokens (a resend does not kill the one already in the
// employee's inbox) — redeeming any one burns them all for that
// document_instance, the exact policyAckTokens.ts precedent.

const SIGNATURE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function mintSignatureToken(
  service: SupabaseClient, documentInstanceId: string, now: number = Date.now(),
): Promise<{ token: string; expiresAt: string } | { error: string }> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(now + SIGNATURE_TOKEN_TTL_MS).toISOString();
  const { error } = await service.from('document_signature_tokens').insert({
    token_hash: await hashAccessToken(token),
    document_instance_id: documentInstanceId,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };
  return { token, expiresAt };
}

/** Look a token up without using it (the sign page, before the form). */
export async function peekSignatureToken(
  service: SupabaseClient, raw: string | null | undefined, now: number = Date.now(),
): Promise<{ documentInstanceId: string } | 'expired' | null> {
  const token = normaliseAccessToken(raw);
  if (!token) return null;
  const { data } = await service
    .from('document_signature_tokens')
    .select('document_instance_id, expires_at')
    .eq('token_hash', await hashAccessToken(token))
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= now) return 'expired';
  return { documentInstanceId: data.document_instance_id };
}

/** Burns every live token for this instance — called once the instance
 *  itself has already moved to a terminal state (signed/declined). */
export async function burnSignatureTokens(service: SupabaseClient, documentInstanceId: string): Promise<void> {
  await service.from('document_signature_tokens').delete().eq('document_instance_id', documentInstanceId);
}
