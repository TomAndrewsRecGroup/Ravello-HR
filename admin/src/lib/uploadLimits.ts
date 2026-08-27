/**
 * How large a request body this platform will actually accept.
 *
 * Vercel rejects a serverless function's request body over 4.5 MB at the
 * EDGE — before the handler runs, with a bare 413 and no JSON body. Three
 * routes here carried their own, larger ceilings (25 MB, 15 MB, 10 MB,
 * 10 MB) that could therefore never be reached in production:
 *
 *   /api/admin/send-email          25 MB total / 15 MB per file
 *   /api/admin/employee-documents  10 MB
 *   /api/admin/athletes/[id]/cv    10 MB
 *
 * A 5.7 MB attachment passed the browser's guard, was refused by the
 * platform, and reached the operator as "Send failed (413)" with no
 * explanation — because there was no response body for the UI to read.
 *
 * These constants are the one definition. A route that reads a file out of
 * a multipart body MUST use them, and the browser-side guard must use the
 * same number, or the two drift and the user is told a limit that is not
 * the real one.
 *
 * ── The exception, and the way out ──
 * A file that goes from the BROWSER STRAIGHT TO SUPABASE STORAGE never
 * touches a Vercel function and is not bound by any of this.
 * `app/(admin)/reports/ReportUploadForm.tsx` already works that way and
 * happily takes 25 MB. Moving the three routes above onto that pattern is
 * how the real ceiling gets raised; until then, these are the truth.
 */

/** Vercel's documented serverless request-body ceiling. */
export const REQUEST_BODY_CAP = 4_500_000;

/**
 * Headroom for everything in the request that is not the file: multipart
 * part boundaries and headers, and the accompanying text fields. On the
 * email composer that includes `body_html`, which is bounded at 200,000
 * characters on its own — so the caller there must count the body too
 * rather than assuming the slack covers it.
 */
export const REQUEST_SLACK = 100_000;

/** The budget a request's file payload may actually spend. */
export const MAX_UPLOAD_BYTES = REQUEST_BODY_CAP - REQUEST_SLACK;

/** Human-readable size, for a message that has to name the real number. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The one refusal message, so every surface says the same thing and names
 * both the actual size and the limit. "File too large" without the numbers
 * is what sent somebody to the browser console to find a bare 413.
 */
export function tooLargeMessage(actualBytes: number, what = 'This file'): string {
  return `${what} is ${formatBytes(actualBytes)} — over the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit. `
       + 'Compress it, or upload it to Documents and share the link instead.';
}
