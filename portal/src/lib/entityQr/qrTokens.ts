import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken } from '@/lib/auth/accessTokens';

// Entity QR badges (Core-OS 360 Completion Programme, Phase 26, Group
// 4, migration 196) — the exact worker_qr_tokens (179) shape, applied
// to an object instead of a person. Durable, not single-use: a label
// on a machine must stay scannable indefinitely. The raw token exists
// only at mint time (in this response) — entity_qr_tokens holds its
// SHA-256 only, RLS on with no session policies (service role only),
// so there is no "look the token back up" path. company_id, and the
// "at most one active token per entity" rule, are both enforced by
// the migration's own trigger and partial unique index — this file
// never re-derives either, it only calls the table.

export type EntityQrType = 'equipment' | 'coshh_assessment';

const FALLBACK_PORTAL_URL = 'https://portal.thepeoplesystem.co.uk';

/** The absolute URL an entity badge's QR code encodes. */
export function entityQrUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_PORTAL_URL ?? FALLBACK_PORTAL_URL).trim().replace(/\/+$/, '');
  return `${base}/e/${token}`;
}

export interface MintedEntityBadge {
  token: string;
  tokenHash: string;
}

/**
 * Revokes any existing active badge for this entity, then mints a new
 * one. The revoke-first step is a convenience — the DB's own partial
 * unique index (entity_qr_tokens_one_active) would refuse a second
 * active row regardless, so a caller that skips straight to insert
 * without revoking first simply gets a 23505, never a silent second
 * active badge.
 */
export async function mintEntityQrToken(
  service: SupabaseClient,
  entityType: EntityQrType,
  entityId: string,
  actorUserId: string | null,
): Promise<MintedEntityBadge | { error: string }> {
  const token = crypto.randomUUID();
  const tokenHash = await hashAccessToken(token);

  const { error: revokeErr } = await service.from('entity_qr_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_by: actorUserId }, { count: 'exact' })
    .eq('entity_type', entityType).eq('entity_id', entityId).is('revoked_at', null);
  if (revokeErr) return { error: revokeErr.message };

  const { error: insertErr } = await service.from('entity_qr_tokens')
    .insert({ entity_type: entityType, entity_id: entityId, token_hash: tokenHash, created_by: actorUserId });
  if (insertErr) return { error: insertErr.message };

  return { token, tokenHash };
}

/** Revokes the entity's current active badge, if any. Idempotent. */
export async function revokeEntityQrToken(
  service: SupabaseClient,
  entityType: EntityQrType,
  entityId: string,
  actorUserId: string | null,
): Promise<{ revoked: boolean } | { error: string }> {
  const { error, count } = await service.from('entity_qr_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_by: actorUserId }, { count: 'exact' })
    .eq('entity_type', entityType).eq('entity_id', entityId).is('revoked_at', null);
  if (error) return { error: error.message };
  return { revoked: (count ?? 0) > 0 };
}

/** Whether this entity currently holds an active badge — never the
 *  token itself, which cannot be read back once minted (see above). */
export async function hasActiveEntityQrToken(service: SupabaseClient, entityType: EntityQrType, entityId: string): Promise<boolean> {
  const { data } = await service.from('entity_qr_tokens')
    .select('id').eq('entity_type', entityType).eq('entity_id', entityId).is('revoked_at', null).maybeSingle();
  return data != null;
}
