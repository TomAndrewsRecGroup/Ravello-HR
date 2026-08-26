/**
 * Simple in-memory rate limiter for API routes.
 *
 * Uses a sliding window approach. Each key (typically IP or user ID) gets
 * a counter that resets after the window expires. Not suitable for distributed
 * deployments with multiple instances: use Vercel KV or Upstash for that.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
 *   // In route handler:
 *   const { allowed, remaining } = limiter.check(ip);
 *   if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */

interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  max: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter({ windowMs, max }: RateLimiterOptions) {
  const store = new Map<string, WindowEntry>();

  // Periodically clean up expired entries to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }, windowMs * 2);

  // Allow garbage collection of the interval if this module is unloaded
  if (typeof cleanup === 'object' && 'unref' in cleanup) {
    cleanup.unref();
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(key);

      // Window expired or first request: start fresh
      if (!entry || now >= entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
      }

      // Within window
      entry.count++;
      const allowed = entry.count <= max;
      return {
        allowed,
        remaining: Math.max(0, max - entry.count),
        resetAt: entry.resetAt,
      };
    },
  };
}

/**
 * Extract a reasonable rate-limit key from a request.
 * Prefers x-forwarded-for (Vercel sets this), falls back to x-real-ip.
 */
export function getRateLimitKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Key an authenticated route by user id, falling back to IP.
 *
 * IP alone is the wrong key once people are signed in: a whole office
 * behind one NAT shares a bucket, so one person's bulk send throttles
 * their colleagues. IP remains the fallback for unauthenticated routes,
 * where it is the only identity available.
 */
export function getUserRateLimitKey(req: Request, userId?: string | null): string {
  return userId ? `user:${userId}` : `ip:${getRateLimitKey(req)}`;
}

/**
 * Standard 429, with the headers a well-behaved client needs to back off
 * on its own instead of hammering and finding out.
 */
export function rateLimitResponse(resetAt: number): Response {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
      },
    },
  );
}

/**
 * Shared limiter definitions, so a ceiling is set once rather than
 * guessed per route.
 *
 * These exist because the admin app — the one that sends mail through
 * Resend and calls Manatal, IvyLens and Stripe — had no rate limiting at
 * all. An authenticated user, or a loop in a broken client, could
 * exhaust a metered quota or spend money with no ceiling.
 */
export const limiters = {
  /** Anything that sends an email. Deliberately tight: the cost of a
   *  runaway loop here is deliverability, not just spend. */
  email:  createRateLimiter({ windowMs: 60_000, max: 20 }),
  /** Calls to a metered third party (Manatal, IvyLens, Hunter). */
  vendor: createRateLimiter({ windowMs: 60_000, max: 60 }),
  /** File uploads. */
  upload: createRateLimiter({ windowMs: 60_000, max: 30 }),
  /** Account actions — invites, password resets. Abuse here is an
   *  enumeration or mail-bombing vector, not a cost one. */
  account: createRateLimiter({ windowMs: 300_000, max: 15 }),
  /** General authenticated writes. Generous — this is a backstop
   *  against a runaway client, not a usage policy. */
  write:  createRateLimiter({ windowMs: 60_000, max: 200 }),
};
