import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, breakerSnapshot, parseRetryAfter, resetBreakers, resilientFetch } from '../resilient';

const realFetch = globalThis.fetch;

function mockFetch(responses: Array<Response | Error>) {
  let i = 0;
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (url: any) => {
    calls.push(String(url));
    const next = responses[Math.min(i++, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  }) as any;
  return { calls: () => calls, count: () => i };
}

const ok    = () => new Response('{}', { status: 200 });
const bad   = (s: number, h?: Record<string,string>) => new Response('err', { status: s, headers: h });
const timeoutErr = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' });

beforeEach(() => resetBreakers());
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

describe('retry', () => {
  it('retries a 502 and succeeds', async () => {
    const m = mockFetch([bad(502), bad(502), ok()]);
    const r = await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'v', baseDelayMs: 1, retries: 2 });
    expect(r.response?.status).toBe(200);
    expect(m.count()).toBe(3);
  });

  it('retries a network timeout', async () => {
    const m = mockFetch([timeoutErr(), ok()]);
    const r = await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'v', baseDelayMs: 1 });
    expect(r.response?.status).toBe(200);
    expect(m.count()).toBe(2);
  });

  it('does NOT retry a POST by default', async () => {
    // A timed-out POST may have succeeded with the response lost.
    // Repeating it would create a second job, org or email.
    const m = mockFetch([bad(502), ok()]);
    const r = await resilientFetch('https://x/y', { method: 'POST' }, { vendor: 'v', baseDelayMs: 1 });
    expect(m.count()).toBe(1);
    expect(r.response).toBeNull();
  });

  it('retries a POST only when explicitly opted in', async () => {
    const m = mockFetch([bad(502), ok()]);
    const r = await resilientFetch('https://x/y', { method: 'POST' }, { vendor: 'v', baseDelayMs: 1, retryOnWrite: true });
    expect(m.count()).toBe(2);
    expect(r.response?.status).toBe(200);
  });

  it('does not retry a 404 — the request is wrong, not the server', async () => {
    const m = mockFetch([bad(404), ok()]);
    const r = await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'v', baseDelayMs: 1 });
    expect(m.count()).toBe(1);
    expect(r.response?.status).toBe(404);
    expect(r.error).toBeNull();  // the vendor answered; it is the caller's problem
  });
});

describe('Retry-After', () => {
  it('parses seconds', () => expect(parseRetryAfter('12')).toBe(12_000));
  it('parses an HTTP date', () => {
    const at = new Date(Date.now() + 5_000).toUTCString();
    expect(parseRetryAfter(at)).toBeGreaterThan(3_000);
  });
  it('caps a hostile value rather than sleeping for an hour', () => {
    expect(parseRetryAfter('99999')).toBe(60_000);
  });
  it('returns null for junk so the caller falls back to backoff', () => {
    expect(parseRetryAfter('soon')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe('backoff uses FULL jitter', () => {
  it('spans the whole window rather than clustering', () => {
    // Deterministic backoff synchronises retries across a batch. Full
    // jitter picks uniformly from [0, capped], which is what actually
    // de-synchronises a herd.
    expect(backoffDelay(0, 1000, 8000, () => 0)).toBe(0);
    expect(backoffDelay(0, 1000, 8000, () => 0.999)).toBe(999);
    expect(backoffDelay(3, 1000, 8000, () => 0.999)).toBe(7992); // capped at 8000
  });

  it('never exceeds the cap', () => {
    for (let a = 0; a < 12; a++) {
      expect(backoffDelay(a, 1000, 8000, () => 0.999)).toBeLessThanOrEqual(8000);
    }
  });
});

describe('circuit breaker', () => {
  it('opens after repeated failures and then short-circuits', async () => {
    const m = mockFetch([bad(503)]);
    for (let i = 0; i < 5; i++) {
      await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'manatal', baseDelayMs: 1, retries: 0 });
    }
    expect(breakerSnapshot().manatal.open).toBe(true);

    const before = m.count();
    const r = await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'manatal', baseDelayMs: 1 });
    expect(r.shortCircuited).toBe(true);
    expect(r.response).toBeNull();
    expect(m.count()).toBe(before);  // no call was made at all
  });

  it('isolates vendors — Manatal being down must not stop IvyLens', async () => {
    mockFetch([bad(503)]);
    for (let i = 0; i < 5; i++) {
      await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'manatal', baseDelayMs: 1, retries: 0 });
    }
    expect(breakerSnapshot().manatal.open).toBe(true);
    expect(breakerSnapshot().ivylens).toBeUndefined();

    mockFetch([ok()]);
    const r = await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'ivylens', baseDelayMs: 1 });
    expect(r.response?.status).toBe(200);
  });

  it('a success resets the failure count', async () => {
    mockFetch([bad(503)]);
    for (let i = 0; i < 3; i++) {
      await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'v', baseDelayMs: 1, retries: 0 });
    }
    expect(breakerSnapshot().v.failures).toBe(3);

    mockFetch([ok()]);
    await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'v', baseDelayMs: 1 });
    expect(breakerSnapshot().v.failures).toBe(0);
  });

  it('a 4xx does not count against the breaker', async () => {
    mockFetch([bad(400)]);
    for (let i = 0; i < 8; i++) {
      await resilientFetch('https://x/y', { method: 'GET' }, { vendor: 'v', baseDelayMs: 1, retries: 0 });
    }
    // The vendor is healthy — we are sending bad requests. Tripping the
    // breaker here would stop the run for no reason.
    expect(breakerSnapshot().v.open).toBe(false);
  });
});

describe('deadline', () => {
  it('refuses to start an attempt that cannot finish in time', async () => {
    const m = mockFetch([ok()]);
    const r = await resilientFetch('https://x/y', { method: 'GET' },
      { vendor: 'v', timeoutMs: 10_000, deadline: Date.now() + 100 });
    expect(m.count()).toBe(0);
    expect(r.error).toMatch(/deadline/i);
  });

  it('stops retrying when the budget runs out mid-ladder', async () => {
    // Real backoff sleeps here rather than 1ms, so wall-clock actually
    // advances: with a mocked instant fetch and a 1ms base the whole
    // ladder finishes inside any sane deadline and the guard is never
    // reached. The point is that it gives up EARLY, not that it fails.
    const m = mockFetch([bad(503)]);
    const r = await resilientFetch('https://x/y', { method: 'GET' },
      { vendor: 'v', timeoutMs: 60, baseDelayMs: 150, maxDelayMs: 150, retries: 5, deadline: Date.now() + 260 });

    expect(r.response).toBeNull();
    expect(m.count()).toBeGreaterThanOrEqual(1);
    expect(m.count()).toBeLessThan(6);          // stopped short of the full ladder
  });
});
