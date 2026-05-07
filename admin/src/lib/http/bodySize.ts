import { NextResponse, type NextRequest } from 'next/server';

/**
 * Guard against oversized JSON / text request bodies. Reads the
 * `content-length` header (which Next.js / Vercel populate for any
 * non-streaming request) and returns a 413 NextResponse if the body
 * exceeds `max` bytes. Returns null if the body is acceptable so the
 * caller can proceed.
 *
 * Usage:
 *   const tooBig = assertBodySize(req, 64 * 1024);
 *   if (tooBig) return tooBig;
 *
 * Notes:
 *  - Skip this for multipart/form-data routes; they should size-check
 *    each file individually.
 *  - Skip this for Stripe webhooks (signature-verified, variable size).
 *  - A missing / unparseable header treats the body as 0 (allowed).
 *    The downstream `req.json()` will still reject malformed payloads.
 */
export function assertBodySize(req: NextRequest, max: number): NextResponse | null {
  const len = Number(req.headers.get('content-length')) || 0;
  if (len > max) {
    return NextResponse.json(
      { error: 'Request body too large' },
      { status: 413 },
    );
  }
  return null;
}
