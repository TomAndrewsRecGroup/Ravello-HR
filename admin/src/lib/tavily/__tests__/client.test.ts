import { beforeEach, describe, expect, it, vi } from 'vitest';

let fetchResult: { response: Response | null; error: string | null };
let fetchCalls: Array<{ url: string; init: RequestInit }>;

vi.mock('@/lib/http/resilient', () => ({
  resilientFetch: (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return Promise.resolve(fetchResult);
  },
}));

// TAVILY_API_KEY is read into a module-scope const at import time (the
// same pattern this codebase's ivylens.ts already uses) — it must be
// set BEFORE the module is first imported, not in a beforeEach that
// runs after that import has already happened.
process.env.TAVILY_API_KEY = 'test-key';
process.env.TAVILY_API_URL = 'https://api.tavily.example/search';

beforeEach(() => {
  fetchCalls = [];
});

const { tavilySearch, summariseResults, defaultQueryFor } = await import('../client');

const jsonResponse = (body: unknown, ok = true, status = 200): Response => ({
  ok, status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
} as unknown as Response);

describe('tavilySearch', () => {
  it('refuses an empty query without making a call', async () => {
    const res = await tavilySearch('   ');
    expect(res).toEqual({ results: null, error: 'A search query is required' });
    expect(fetchCalls).toHaveLength(0);
  });

  it('refuses when TAVILY_API_KEY is not configured, without making a call', async () => {
    // The module caches the key at import time, so proving the
    // "unset" branch needs a genuinely fresh module instance loaded
    // under an unset env — vi.resetModules() + a scoped re-import,
    // never touching the `tavilySearch` reference every other test in
    // this file already holds.
    const previous = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    vi.resetModules();
    const fresh = await import('../client');
    const res = await fresh.tavilySearch('Health and Safety at Work Act');
    expect(res.error).toMatch(/TAVILY_API_KEY/);
    expect(fetchCalls).toHaveLength(0);
    process.env.TAVILY_API_KEY = previous;
    vi.resetModules();
  });

  it('never sends the API key anywhere but the request body to Tavily itself', async () => {
    fetchResult = { response: jsonResponse({ results: [] }), error: null };
    await tavilySearch('COSHH regulations update');
    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(body.api_key).toBe('test-key');
    // Never in a header or the URL — only in the POST body Tavily itself expects.
    expect(fetchCalls[0].url).not.toContain('test-key');
    expect(JSON.stringify(fetchCalls[0].init.headers ?? {})).not.toContain('test-key');
  });

  it('maps and clips a real Tavily response shape', async () => {
    fetchResult = {
      response: jsonResponse({ results: [{ title: 'x'.repeat(400), url: 'https://example.com/a', content: 'y'.repeat(2000) }] }),
      error: null,
    };
    const res = await tavilySearch('query');
    expect(res.error).toBeNull();
    expect(res.results).toHaveLength(1);
    expect(res.results![0].title.length).toBe(300);
    expect(res.results![0].content.length).toBe(1000);
  });

  it('reports a vendor-level failure (timeout, circuit breaker) as an error, never a thrown exception', async () => {
    fetchResult = { response: null, error: 'tavily circuit breaker is open' };
    const res = await tavilySearch('query');
    expect(res.results).toBeNull();
    expect(res.error).toMatch(/circuit breaker/);
  });

  it('reports a non-2xx Tavily response as an error', async () => {
    fetchResult = { response: jsonResponse({ message: 'bad request' }, false, 400), error: null };
    const res = await tavilySearch('query');
    expect(res.results).toBeNull();
    expect(res.error).toMatch(/HTTP 400/);
  });

  it('reports an unexpected response shape as an error rather than crashing', async () => {
    fetchResult = { response: jsonResponse({ nonsense: true }), error: null };
    const res = await tavilySearch('query');
    expect(res.results).toBeNull();
    expect(res.error).toMatch(/Unexpected response shape/);
  });
});

describe('summariseResults', () => {
  it('is a verbatim join of title/url/content, never a paraphrase', () => {
    const out = summariseResults([{ title: 'HSE update', url: 'https://hse.gov.uk/x', content: 'Some detail.' }]);
    expect(out).toContain('HSE update');
    expect(out).toContain('https://hse.gov.uk/x');
    expect(out).toContain('Some detail.');
  });

  it('says plainly when there is nothing to report, rather than an empty string', () => {
    expect(summariseResults([])).toMatch(/no results/i);
  });

  it('clips to the 4000-char DB column limit', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ title: `Result ${i}`, url: `https://x.example/${i}`, content: 'z'.repeat(500) }));
    expect(summariseResults(results).length).toBeLessThanOrEqual(4000);
  });
});

describe('defaultQueryFor', () => {
  it('combines title and jurisdiction, clipped to 500 chars', () => {
    const q = defaultQueryFor('Health and Safety at Work etc. Act 1974', 'UK');
    expect(q).toContain('Health and Safety at Work etc. Act 1974');
    expect(q).toContain('UK');
    expect(q.length).toBeLessThanOrEqual(500);
  });
});
