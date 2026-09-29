import type { SupabaseClient } from '@supabase/supabase-js';
import { evidenceProblem, safeFileName } from '@/lib/hs/evidence';

// Workforce evidence files (134): certificates, licences, cards,
// competency and induction evidence, in the private workforce-evidence
// bucket. Clinical documents are NOT here — they go to oh-clinical (135)
// through clinicalKey(), readable only with an explicit clinical grant.
//
// Key: <company_id>/<kind>/<person_id>/<uuid>-<name>. The storage policy
// decides from these folders: the first must be the ACTIVE organisation,
// the second one of WORKFORCE_EVIDENCE_KINDS, and a caller without a
// workforce capability may upload only into their OWN person folder.
// READ is granted only when a record's evidence_path equals the key, so
// the order is: upload, then write the record that names it. Always
// build keys here.

export const WORKFORCE_EVIDENCE_BUCKET = 'workforce-evidence';
export const OH_CLINICAL_BUCKET = 'oh-clinical';

export const WORKFORCE_EVIDENCE_KINDS = ['training', 'credential', 'competency', 'induction', 'authorisation', 'pre_employment'] as const;
export type WorkforceEvidenceKind = typeof WORKFORCE_EVIDENCE_KINDS[number];

export function workforceEvidenceKey(companyId: string, kind: WorkforceEvidenceKind, personId: string, fileName: string,
                                     id: string = crypto.randomUUID()): string {
  return `${companyId}/${kind}/${personId}/${id}-${safeFileName(fileName)}`;
}

/** 135: <company_id>/<person_id>/<uuid>-<name>, uploadable only with a clinical grant. */
export function clinicalKey(companyId: string, personId: string, fileName: string, id: string = crypto.randomUUID()): string {
  return `${companyId}/${personId}/${id}-${safeFileName(fileName)}`;
}

/** Upload a file; returns the key to store as the record's evidence_path, or an error. */
export async function uploadWorkforceEvidence(
  supabase: SupabaseClient,
  a: { companyId: string; kind: WorkforceEvidenceKind; personId: string; file: File },
): Promise<{ key: string; error: null } | { key: null; error: string }> {
  const problem = evidenceProblem(a.file);
  if (problem) return { key: null, error: problem };
  const key = workforceEvidenceKey(a.companyId, a.kind, a.personId, a.file.name);
  const { error } = await supabase.storage.from(WORKFORCE_EVIDENCE_BUCKET)
    .upload(key, a.file, { contentType: a.file.type, upsert: false });
  if (error) return { key: null, error: `Could not upload ${a.file.name}: ${error.message}` };
  return { key, error: null };
}

/** A five-minute link, signed under the viewer's own session (RLS decides). */
export async function workforceEvidenceUrl(supabase: SupabaseClient, key: string, bucket: string = WORKFORCE_EVIDENCE_BUCKET): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(key, 300);
  return data?.signedUrl ?? null;
}
