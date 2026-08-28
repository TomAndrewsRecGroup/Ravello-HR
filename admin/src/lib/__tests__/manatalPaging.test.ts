// Every applicant, or an honest report that it could not be.
//
// `getManatalMatchesForJob` used to request ONE page of 200 and return
// whatever came back. Manatal orders /matches/ deterministically, so a
// job with more than 200 applicants returned the SAME first 200 on every
// hourly run and applicant 201 onwards was never scanned — for as long
// as the role existed.
//
// THE ASSERTION IS WHICH PAGES WERE ASKED FOR, not what came back. A
// single-page read and an exhaustive one produce identical arrays
// whenever the job is small, which is exactly why the bug survived: the
// live jobs today hold 7 matches and would look perfect either way. An
// unasked page and an empty page are indistinguishable in a return value.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

/** Requested URLs, in order. */
let asked: string[] = [];

function page(results: unknown[], next: string | null) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ count: 0, next, previous: null, results }),
    text: async () => JSON.stringify({ count: 0, next, previous: null, results }),
  } as unknown as Response;
}

/** A 4xx, not a 5xx: `resilientFetch` retries 5xx with backoff, which
 *  would make this suite slow and turn the "which pages were asked"
 *  assertion into a count of retries. A 400 is a single, final failure —
 *  and the property under test is what the WALK does with a failed page,
 *  which is the same either way. */
function failedPage() {
  return {
    ok: false,
    status: 400,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ detail: 'bad request' }),
    text: async () => '{"detail":"bad request"}',
  } as unknown as Response;
}

function match(id: number) {
  return { id, candidate: id, job: 1, creator: null, stage: { id: 1, name: 'New' }, is_active: true, created_at: '', updated_at: '' };
}

beforeEach(() => {
  asked = [];
  process.env.MANATAL_API_KEY = 'test-key';
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

async function load() {
  return import('../manatal');
}

describe('getManatalMatchesForJob walks every page', () => {
  it('asks for page 2 when the first page reports one', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(String(url));
      const p = new URL(String(url)).searchParams.get('page');
      if (p === '1') return page([match(1), match(2)], 'https://api.manatal.com/open/v3/matches/?page=2');
      return page([match(3)], null);
    }));

    const { getManatalMatchesForJob } = await load();
    const { matches, truncated } = await getManatalMatchesForJob('4324606');

    // Without the walk this is 2, and nobody ever sees candidate 3.
    expect(matches.map(m => m.id)).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);

    const pages = asked.map(u => new URL(u).searchParams.get('page'));
    expect(pages).toEqual(['1', '2']);
    // And it must still be scoped to the job — a walk that drops the
    // filter would refer applicants from every other role.
    for (const u of asked) {
      expect(new URL(u).searchParams.get('job_id')).toBe('4324606');
    }
  });

  it('stops at the last page rather than asking forever', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(String(url));
      return page([match(1)], null);
    }));

    const { getManatalMatchesForJob } = await load();
    const { matches, truncated } = await getManatalMatchesForJob('J');
    expect(matches).toHaveLength(1);
    expect(truncated).toBe(false);
    expect(asked).toHaveLength(1);
  });

  it('reports truncated when a page fails, instead of "no more applicants"', async () => {
    // The important half. A vendor error on page 2 must NOT look like
    // the end of the list — that is a partial read presented as a
    // complete one, and the caller would record "everyone scanned".
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(String(url));
      const p = new URL(String(url)).searchParams.get('page');
      if (p === '1') return page([match(1)], 'https://api.manatal.com/open/v3/matches/?page=2');
      return failedPage();
    }));

    const { getManatalMatchesForJob } = await load();
    const { matches, truncated } = await getManatalMatchesForJob('J');

    expect(matches.map(m => m.id)).toEqual([1]);
    expect(truncated).toBe(true);
  });

  it('stops at maxPages and says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      asked.push(String(url));
      return page([match(1)], 'https://api.manatal.com/open/v3/matches/?page=99');
    }));

    const { getManatalMatchesForJob } = await load();
    const { matches, truncated } = await getManatalMatchesForJob('J', { maxPages: 3 });

    expect(asked).toHaveLength(3);
    expect(matches).toHaveLength(3);
    // Never silently: a run that hit the backstop reports it.
    expect(truncated).toBe(true);
  });
});
