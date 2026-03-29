// ─── Partner API Key Authentication ──────────────────────────────────────────
// Validates ivl_ API keys from the Authorization header against partner_api_keys.
// Used by portal partner API routes: /api/partner/bd/leads, /api/partner/roles/analyze, etc.

import { createHash } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

interface AuthResult {
  valid: boolean;
  keyId?: string;
  permissions?: string[];
  error?: string;
  status?: number;
}

export async function authenticatePartnerKey(
  authHeader: string | null,
  requiredPermission: string,
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ivl_')) {
    return { valid: false, error: 'Missing or invalid API key. Use Authorization: Bearer ivl_...', status: 401 };
  }

  const rawKey = authHeader.replace('Bearer ', '');
  const hash = hashKey(rawKey);

  const supabase = createServerSupabaseClient();
  const { data: key, error } = await supabase
    .from('partner_api_keys')
    .select('id, permissions, is_active')
    .eq('key_hash', hash)
    .single();

  if (error || !key) {
    return { valid: false, error: 'Invalid API key', status: 401 };
  }

  if (!key.is_active) {
    return { valid: false, error: 'API key has been revoked', status: 403 };
  }

  const perms: string[] = key.permissions ?? [];
  if (!perms.includes(requiredPermission)) {
    return { valid: false, error: `API key lacks '${requiredPermission}' permission`, status: 403 };
  }

  // Update last_used_at (fire-and-forget)
  supabase
    .from('partner_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => {});

  return { valid: true, keyId: key.id, permissions: perms };
}
