// Mirror of admin/src/lib/storage/files.ts — see that file for the
// design rationale. Duplication is deliberate: the two apps deploy
// separately on Vercel so a shared workspace package would need
// build tooling we don't have.

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

export async function signFileUrl(
  sb:     SupabaseClient,
  bucket: string,
  path:   string,
  ttl:    number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, ttl);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
