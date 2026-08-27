/**
 * Where a staged email attachment lives, and which ones a caller may
 * attach. Shared by the browser (which writes the path) and the route
 * (which validates it), so the convention cannot drift between them.
 *
 * ── Why this file is security-critical ──
 * The send route no longer receives file BYTES, it receives a PATH, and
 * it fetches that object with the SERVICE ROLE — which bypasses RLS
 * entirely. So the route is one careless line away from being an
 * arbitrary-file-read of the whole storage account.
 *
 * Three things keep it closed, and all three are needed:
 *
 *   1. The BUCKET is a constant here, never taken from the request.
 *      A caller-supplied bucket would reach `documents`, `cvs` and
 *      every client file in them.
 *   2. The path must be exactly `outbox/<uid>/<file>` — three segments,
 *      no traversal, no absolute path.
 *   3. The `<uid>` segment must equal the AUTHENTICATED caller's id.
 *      Not "some uid": theirs. Without this a staff member could attach
 *      a colleague's staged file by guessing a path, and the service
 *      role would happily fetch it.
 *
 * Rule 3 is also enforced in the database (migration 081's RLS), so a
 * bypass needs both layers to be wrong at once. The RLS covers the
 * upload and any client-side read; this covers the service-role fetch,
 * which RLS cannot see.
 */

/** Fixed server-side. Never read from a request. */
export const ATTACHMENT_BUCKET = 'email-attachments';

/** Everything staged for sending lives under this prefix. */
export const ATTACHMENT_PREFIX = 'outbox';

/**
 * Strip a filename to something safe to put in a storage key and in a
 * MIME header. Supabase keys tolerate a lot, but a name carrying a
 * slash would invent a folder level and break the three-segment
 * assumption every check below rests on.
 */
export function sanitiseFilename(name: string): string {
  const cleaned = name
    .replace(/[\r\n]/g, '')            // header injection
    .replace(/[^\w.\- ]+/g, '_')       // slashes, quotes, control chars
    // Collapse dot runs. Without this `../../etc/passwd` cleans to
    // `.._.._etc_passwd`, which still contains `..` — so the path the
    // browser uploads to is one `checkStagedPath` then REFUSES, and the
    // attachment silently fails to send. Caught by the round-trip test,
    // not by reading either function on its own.
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'attachment';
}

/**
 * The path a browser should upload to. `unique` keeps two files of the
 * same name in one message from colliding — `upsert: false` would fail
 * the second, and `upsert: true` would silently replace the first.
 */
export function stagedAttachmentPath(userId: string, filename: string, unique: string): string {
  return `${ATTACHMENT_PREFIX}/${userId}/${unique}_${sanitiseFilename(filename)}`;
}

/**
 * May this caller attach this path?
 *
 * Returns a reason rather than a bare false so a refusal can be logged
 * with something specific — "invalid attachment" tells whoever reads it
 * nothing about which rule tripped.
 */
export function checkStagedPath(path: unknown, callerUserId: string): { ok: true } | { ok: false; reason: string } {
  if (typeof path !== 'string' || !path) {
    return { ok: false, reason: 'attachment path missing' };
  }
  if (path.length > 512) {
    return { ok: false, reason: 'attachment path too long' };
  }
  // Traversal and absolute paths, before any structural parsing —
  // `outbox/<uid>/../../cvs/x` has the right shape and must not reach
  // the segment checks and pass them.
  if (path.includes('..') || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    return { ok: false, reason: 'attachment path is not a plain key' };
  }

  const segments = path.split('/');
  if (segments.length !== 3 || segments.some(s => s === '')) {
    return { ok: false, reason: 'attachment path is not outbox/<user>/<file>' };
  }
  if (segments[0] !== ATTACHMENT_PREFIX) {
    return { ok: false, reason: 'attachment is not in the outbox prefix' };
  }
  if (segments[1] !== callerUserId) {
    // The one that matters: somebody else's staged file.
    return { ok: false, reason: 'attachment belongs to another user' };
  }
  return { ok: true };
}
