import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_ATTACHMENT_BYTES, tooLargeMessage } from '@/lib/uploadLimits';

// Evidence files for H&S records, in the private hs-evidence bucket.
//
// The key is <company_id>/<entity_type>/<entity_id>/<uuid>-<name>. That
// shape is load-bearing, not tidy: the storage policies (095) decide who
// may read and upload from its FIRST folder (the client) and SECOND
// folder (the kind of record, hence the provider scope), and hs_files
// has a CHECK tying its row to the same three parts. Always build keys
// here.
//
// Uploads go straight from the browser to storage under the user's own
// session, so the storage policy is the boundary; nothing passes through
// a service-role route.

export const HS_EVIDENCE_BUCKET = 'hs-evidence';

/** What the bucket accepts (095 allowed_mime_types). */
export const HS_EVIDENCE_ACCEPT = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '');
  return (cleaned || 'file').slice(-120);
}

export function evidenceKey(companyId: string, entityType: string, entityId: string, fileName: string, id: string = crypto.randomUUID()): string {
  return `${companyId}/${entityType}/${entityId}/${id}-${safeFileName(fileName)}`;
}

/** Why this file cannot be uploaded, or null. */
export function evidenceProblem(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return tooLargeMessage(file.size, file.name);
  if (!(HS_EVIDENCE_ACCEPT as readonly string[]).includes(file.type)) {
    return `${file.name} is not a supported type. Upload a PDF, photo (JPEG, PNG, WebP, HEIC), Word or Excel file.`;
  }
  return null;
}

/**
 * Upload one file and record it. Returns an error message or null.
 * Storage first, then the row: a row pointing at a missing object would
 * show a link that 404s.
 */
export async function uploadEvidence(
  supabase: SupabaseClient,
  a: { companyId: string; entityType: string; entityId: string; file: File },
): Promise<string | null> {
  const problem = evidenceProblem(a.file);
  if (problem) return problem;
  const key = evidenceKey(a.companyId, a.entityType, a.entityId, a.file.name);
  const { error: upErr } = await supabase.storage.from(HS_EVIDENCE_BUCKET)
    .upload(key, a.file, { contentType: a.file.type, upsert: false });
  if (upErr) return `Could not upload ${a.file.name}: ${upErr.message}`;
  const { error: rowErr } = await supabase.from('hs_files').insert({
    company_id: a.companyId, entity_type: a.entityType, entity_id: a.entityId,
    storage_path: key, file_name: a.file.name.slice(0, 255), mime_type: a.file.type, size_bytes: a.file.size,
  });
  if (rowErr) return `${a.file.name} uploaded but could not be recorded: ${rowErr.message}`;
  return null;
}

/** A short-lived link to open a file, signed under the user's own session. */
export async function evidenceUrl(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await supabase.storage.from(HS_EVIDENCE_BUCKET).createSignedUrl(key, 300);
  return data?.signedUrl ?? null;
}
