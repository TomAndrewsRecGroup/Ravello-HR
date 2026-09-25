// Resilient HTTP for third-party APIs.
//
// Built for the Micro1 referral pipeline, which depends on two external
// services per candidate — Manatal for the record and CV, IvyLens for
// the score — inside an hourly cron with a hard 300s ceiling. Before
// this, Manatal had NO retry at all: one 10-second timeout and the call
// returned null, which the pipeline recorded as a scan error. A single
// transient 502 cost a candidate their referral until somebody noticed
// the row.
//
// Four things this provides, each for a failure actually reachable here:
//
//   1. Bounded retry with FULL JITTER. Deterministic backoff
//      (2s, 4s, 8s) synchronises retries across the 25 candidates in a
//      batch, so a wobbling vendor gets hit by a thundering herd at
//      exactly the moment it is least able to cope. Jitter spreads them.
//
//   2. Retry-After is honoured. Both vendors rate-limit. Guessing a
//      backoff when the server has told you exactly how long to wait is
//      how a 429 becomes a ban.
//
//   3. A circuit breaker per vendor. Without one, a fully-down Manatal
//      is retried 3x for each of 25 candidates — 75 doomed calls and
//      several minutes of a 300-second budget spent learning the same
//      fact 75 times. After N consecutive failures the breaker opens and
//      the rest of the batch fails fast, leaving budget for the roles
//      that can still be processed.
//
//   4. A deadline. Every call takes an optional absolute deadline so the
//      caller can guarantee the batch finishes inside maxDuration
//      instead of being killed mid-write.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// It does not retry non-idempotent requests by default. A POST that
// times out may well have succeeded — the response was lost, not the
// work — and retrying it creates a second job, a second organisation, a
// second email. Writes opt in explicitly via `retryOnWrite` and only
// where the endpoint is genuinely idempotent.
//
// HONEST LIMITATION: the breaker is in-process. On Vercel that means per
// lambda instance, and it resets on a cold start. That is exactly the
// scope that matters here — one cron invocation is one instance
// processing one batch — but it is not a distributed breaker and must
// not be described as one.

export interface ResilientOptions {
  /** Vendor key for the circuit breaker and logs, e.g. 'manatal'. */
  vendor: string;
  /** Per-attempt timeout. Default 15s. */
  timeoutMs?: number;
  /** Retries AFTER the first attempt. Default 2 (so 3 calls). */
  retries?: number;
  /** Base backoff before jitter. Default 500ms. */
  baseDelayMs?: number;
  /** Ceiling for a single backoff. Default 8s. */
  maxDelayMs?: number;
  /** Absolute epoch-ms deadline for the whole call including retries. */
  deadline?: number;
  /** Opt in to retrying a non-idempotent method. Only for endpoints
   *  proven safe to repeat. */
  retryOnWrite?: boolean;
  /** Status codes worth retrying. Default: 408, 425, 429, 500, 502, 503, 504. */
  retryStatuses?: number[];
}

export interface ResilientResult {
  response: Response | null;
  /** Populated when every attempt failed. */
  error:    string | null;
  attempts: number;
  /** True when the breaker refused before making any call. */
  shortCircuited: boolean;
  elapsedMs: number;
}

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/* ─── Circuit breaker ──────────────────────────────────────── */

interface BreakerState {
  consecutiveFailures: number;
  openedAt:            number | null;
}

const breakers = new Map<string, BreakerState>();

/** Consecutive failures before the breaker opens. Low enough to stop a
 *  batch wasting its budget, high enough that one blip does not trip it. */
const BREAKER_THRESHOLD = 5;
/** How long the breaker stays open before allowing one probe through. */
const BREAKER_COOLDOWN_MS = 30_000;

function breaker(vendor: string): BreakerState {
  let b = breakers.get(vendor);
  if (!b) { b = { consecutiveFailures: 0, openedAt: null }; breakers.set(vendor, b); }
  return b;
}

function breakerIsOpen(vendor: string): boolean {
  const b = breaker(vendor);
  if (b.openedAt === null) return false;
  if (Date.now() - b.openedAt >= BREAKER_COOLDOWN_MS) {
    // Half-open: let one call through to see whether the vendor is back.
    b.openedAt = null;
    b.consecutiveFailures = BREAKER_THRESHOLD - 1;
    return false;
  }
  return true;
}

function recordSuccess(vendor: string) {
  const b = breaker(vendor);
  b.consecutiveFailures = 0;
  b.openedAt = null;
}

function recordFailure(vendor: string) {
  const b = breaker(vendor);
  b.consecutiveFailures += 1;
  if (b.consecutiveFailures >= BREAKER_THRESHOLD && b.openedAt === null) {
    b.openedAt = Date.now();
    console.error(JSON.stringify({
      _audit: true, action: 'http.breaker.opened', vendor,
      consecutive_failures: b.consecutiveFailures, cooldown_ms: BREAKER_COOLDOWN_MS,
    }));
  }
}

/** Test seam — a breaker that persists between tests would make them
 *  order-dependent, which is its own silent failure. */
export function resetBreakers() { breakers.clear(); }

export function breakerSnapshot(): Record<string, { failures: number; open: boolean }> {
  const out: Record<string, { failures: number; open: boolean }> = {};
  for (const [vendor, b] of breakers) {
    out[vendor] = { failures: b.consecutiveFailures, open: b.openedAt !== null };
  }
  return out;
}

/* ─── Backoff ──────────────────────────────────────────────── */

/** Full jitter: a uniform pick from [0, capped exponential].
 *
 *  Not "exponential plus a bit of noise" — full jitter is what actually
 *  de-synchronises a herd, and it is what AWS's own architecture
 *  guidance recommends. Exported for testing, since a backoff nobody
 *  can observe is a backoff nobody can verify. */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random = Math.random): number {
  const capped = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  return Math.floor(random() * capped);
}

/** Parse Retry-After, which may be seconds or an HTTP date. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const at = Date.parse(header);
  if (!Number.isNaN(at)) return Math.max(0, Math.min(at - now, 60_000));
  return null;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/* ─── The call ─────────────────────────────────────────────── */

export async function resilientFetch(
  url: string,
  init: RequestInit,
  opts: ResilientOptions,
): Promise<ResilientResult> {
  const {
    vendor,
    timeoutMs   = 15_000,
    retries     = 2,
    baseDelayMs = 500,
    maxDelayMs  = 8_000,
    deadline,
    retryOnWrite = false,
    retryStatuses = DEFAULT_RETRY_STATUSES,
  } = opts;

  const started = Date.now();
  const method  = (init.method ?? 'GET').toUpperCase();
  const mayRetry = SAFE_METHODS.has(method) || retryOnWrite;

  if (breakerIsOpen(vendor)) {
    return {
      response: null,
      error: `${vendor} circuit breaker is open — ${BREAKER_THRESHOLD} consecutive failures. Skipping to preserve the run's remaining budget.`,
      attempts: 0,
      shortCircuited: true,
      elapsedMs: 0,
    };
  }

  let lastError = 'no attempt made';

  for (let attempt = 0; attempt <= (mayRetry ? retries : 0); attempt++) {
    // Never start an attempt that cannot finish inside the deadline.
    if (deadline && Date.now() + timeoutMs > deadline) {
      lastError = `deadline reached before attempt ${attempt + 1}`;
      break;
    }

    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });

      if (res.ok) {
        recordSuccess(vendor);
        return { response: res, error: null, attempts: attempt + 1, shortCircuited: false, elapsedMs: Date.now() - started };
      }

      // A 4xx that is not in the retry list is the server telling us the
      // request is wrong. Retrying it is just noise, and it counts
      // against the breaker for no reason.
      if (!retryStatuses.includes(res.status)) {
        recordSuccess(vendor); // the vendor answered; our request was the problem
        return { response: res, error: null, attempts: attempt + 1, shortCircuited: false, elapsedMs: Date.now() - started };
      }

      lastError = `HTTP ${res.status}`;

      if (attempt >= (mayRetry ? retries : 0)) break;

      // The server said how long to wait. Believe it.
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      const delay = retryAfter ?? backoffDelay(attempt, baseDelayMs, maxDelayMs);

      if (deadline && Date.now() + delay + timeoutMs > deadline) {
        lastError = `HTTP ${res.status}, no budget left to retry`;
        break;
      }
      await sleep(delay);
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      lastError = isTimeout ? `timeout after ${timeoutMs}ms` : (err?.message ?? 'network error');

      if (attempt >= (mayRetry ? retries : 0)) break;

      const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      if (deadline && Date.now() + delay + timeoutMs > deadline) {
        lastError += ', no budget left to retry';
        break;
      }
      await sleep(delay);
    }
  }

  recordFailure(vendor);
  console.error(JSON.stringify({
    _audit: true, action: 'http.call.failed', vendor, url: url.split('?')[0],
    method, error: lastError, elapsed_ms: Date.now() - started,
  }));

  return {
    response: null,
    error: `${vendor}: ${lastError}`,
    attempts: (mayRetry ? retries : 0) + 1,
    shortCircuited: false,
    elapsedMs: Date.now() - started,
  };
}
