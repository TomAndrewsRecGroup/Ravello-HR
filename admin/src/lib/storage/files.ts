// Helpers for working with private-bucket file references.
//
// Storage philosophy:
//   - Persist the *path* under the bucket (not a getPublicUrl()).
//   - Mint short-lived signed URLs at READ time so a leak from a log
//     line, email body or screenshot can't be replayed beyond the
//     TTL, and a future bucket-public toggle wouldn't expose anything
//     (signed URLs are gated by signature, not bucket visibility).
//   - cv_url / file_url columns stay populated on writes for backward
//     compat. Once readers are migrated to the signed-on-demand path
//     those columns can be dropped.

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Mint a signed URL for an object in a private bucket.
 *
 * Returns null on any failure (bucket missing, path missing, RLS
 * etc.) so callers can fall back to the legacy `*_url` column for
 * old rows that pre-date the storage_path migration.
 */
export async function signFileUrl(
  sb:     SupabaseClient,
  bucket: string,
  path:   string,
  ttl:    number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, ttl);
  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}
