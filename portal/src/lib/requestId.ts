/**
 * Extract or generate a request ID for correlation tracking.
 *
 * Uses x-request-id header if present (set by Vercel/load balancer),
 * otherwise generates a random ID. Pass this to logs and downstream
 * API calls for end-to-end tracing.
 */
export function getRequestId(req: Request): string {
  return (
    req.headers.get('x-request-id') ??
    req.headers.get('x-vercel-id') ??
    crypto.randomUUID()
  );
}
