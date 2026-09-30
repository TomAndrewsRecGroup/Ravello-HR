import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAccessToken, normaliseAccessToken } from '@/lib/auth/accessTokens';

// The one place an entity QR badge token is resolved to a status —
// used by the public GET status route, so there is exactly one
// interpretation of what a token means. The SERVICE ROLE client is
// used throughout: entity_qr_tokens is RLS-on-no-policies (196), and
// an anonymous scan has no session for RLS to evaluate anyway.

export interface EntityQrStatus {
  ok: true;
  entityType: 'equipment' | 'coshh_assessment';
  fields: Record<string, unknown>;
}

export async function loadEntityQrStatus(
  service: SupabaseClient,
  rawToken: string | null | undefined,
): Promise<EntityQrStatus | { ok: false }> {
  const token = normaliseAccessToken(rawToken);
  if (!token) return { ok: false };
  const tokenHash = await hashAccessToken(token);

  const { data: statusResult } = await service.rpc('entity_qr_status', { p_token_hash: tokenHash });
  if (!statusResult?.ok) return { ok: false };

  const { entity_type, ok: _ok, ...fields } = statusResult as Record<string, unknown>;
  return { ok: true, entityType: entity_type as EntityQrStatus['entityType'], fields };
}
