/**
 * What `/api/files/sign` is allowed to sign, and where it looks.
 *
 * The route takes a `kind` from the query string. That string NEVER
 * reaches a query — it selects an entry here. A caller-supplied table or
 * column name would let anybody read any row of any table by asking
 * nicely, so the mapping is closed and the route refuses anything not in
 * it.
 *
 * Authorisation is deliberately NOT reimplemented here. The route reads
 * the row with the CALLER'S OWN Supabase client, so RLS decides what they
 * can see, and mints the signed URL with that same client, so storage RLS
 * decides again. A row the caller cannot SELECT simply is not found. That
 * is why this route uses no service role — unlike the email-attachment
 * path, which has no user in scope and therefore had to police the path
 * itself.
 */

export interface FileKind {
  /** Table holding the row. */
  table:  string;
  /** Column holding the key within the bucket. */
  column: string;
  /** Private bucket the key lives in. */
  bucket: string;
}

export const FILE_KINDS = {
  document: {
    // `file_path`, not `storage_path`. It predates this work and the
    // portal's DocumentUpload already writes it; adding a second column
    // would have been two names for one fact.
    table:  'documents',
    column: 'file_path',
    bucket: 'documents',
  },
  report: {
    table:  'reports',
    column: 'storage_path',
    bucket: 'documents',
  },
  employee_document: {
    // Named `file_storage_path` here rather than `storage_path` — it
    // landed in migration 062, before the convention settled. Renaming
    // the column is a bigger change than this map is worth.
    table:  'employee_documents',
    column: 'file_storage_path',
    bucket: 'documents',
  },
} as const satisfies Record<string, FileKind>;

export type FileKindName = keyof typeof FILE_KINDS;

/**
 * Resolve a caller-supplied string, or null if it names nothing.
 *
 * The own-property check is load-bearing, not defensive noise. A plain
 * object answers `constructor`, `__proto__` and `toString` from its
 * prototype, and those come back TRUTHY — so `FILE_KINDS[kind] ?? null`
 * hands the caller `Object.prototype.constructor` and every downstream
 * `if (!kind)` waves it through, reaching `.from(undefined)`. Caught by
 * the test, not by reading this.
 */
export function resolveFileKind(kind: unknown): FileKind | null {
  if (typeof kind !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(FILE_KINDS, kind)) return null;
  return (FILE_KINDS as Record<string, FileKind>)[kind];
}

/**
 * How long a minted URL lives.
 *
 * Long enough to click and for a large PDF to finish downloading, short
 * enough that a URL captured in a screenshot, a shared browser history
 * or a log line is useless by the time anybody tries it.
 */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;
