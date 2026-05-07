// Recursively remove every object stored under any path that belongs
// to a given company across the buckets we use. Called by the hard-
// delete-client route so logos, CVs, employee docs, reports and any
// other tenant artefacts don't survive the row cascade.

import type { SupabaseClient } from '@supabase/supabase-js';

// Bucket → list of folder prefixes that may belong to this company.
// Add new entries here as we introduce new buckets.
const BUCKET_PREFIXES: Array<{ bucket: string; prefix: (companyId: string) => string }> = [
  // documents/<company_id>/...
  { bucket: 'documents', prefix: (id) => `${id}` },
  // documents/athletes/<company_id>/<athlete_id>/<file>
  { bucket: 'documents', prefix: (id) => `athletes/${id}` },
  // reports/<company_id>/...
  { bucket: 'reports',   prefix: (id) => `${id}` },
  // cvs/<company_id>/...
  { bucket: 'cvs',       prefix: (id) => `${id}` },
  // logos/company/<company_id>/...
  { bucket: 'logos',     prefix: (id) => `company/${id}` },
];

const PAGE_SIZE = 1000;

/**
 * Recursively delete everything under `prefix` in `bucket`. Returns
 * the number of objects removed and any errors encountered (keeps
 * going on individual failures rather than aborting the whole cascade).
 */
async function wipePrefix(
  sb:     SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<{ removed: number; errors: string[] }> {
  const errors:  string[] = [];
  let removed = 0;
  const stack:   string[] = [prefix];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let offset = 0;

    // page through the listing
    while (true) {
      const { data, error } = await sb.storage.from(bucket).list(current, {
        limit:  PAGE_SIZE,
        offset,
      });
      if (error) {
        errors.push(`${bucket}/${current}: list failed: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;

      const filePaths: string[] = [];
      for (const entry of data) {
        // .id is null on folders, present on files (Supabase quirk).
        if ((entry as any).id === null || entry.metadata == null) {
          stack.push(`${current}/${entry.name}`);
        } else {
          filePaths.push(`${current}/${entry.name}`);
        }
      }

      if (filePaths.length > 0) {
        const { error: rmErr } = await sb.storage.from(bucket).remove(filePaths);
        if (rmErr) {
          errors.push(`${bucket}/${current}: remove failed: ${rmErr.message}`);
        } else {
          removed += filePaths.length;
        }
      }

      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return { removed, errors };
}

export async function wipeCompanyStorage(
  sb:        SupabaseClient,
  companyId: string,
): Promise<{ removed: number; errors: string[] }> {
  let total = 0;
  const errors: string[] = [];
  for (const { bucket, prefix } of BUCKET_PREFIXES) {
    const r = await wipePrefix(sb, bucket, prefix(companyId));
    total += r.removed;
    errors.push(...r.errors);
  }
  return { removed: total, errors };
}
