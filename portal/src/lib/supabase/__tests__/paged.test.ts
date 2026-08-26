import { describe, expect, it } from 'vitest';
import { readAllPages } from '../paged';

function pageSource(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const windows: Array<[number, number]> = [];
  return {
    windows,
    build: (from: number, to: number) => {
      windows.push([from, to]);
      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
    },
  };
}

describe('readAllPages', () => {
  it('walks past the 1000-row cap that .limit() cannot raise', async () => {
    const src = pageSource(2450);
    const r = await readAllPages<{ id: number }>(src.build);

    expect(r.rows).toHaveLength(2450);
    expect(r.pages).toBe(3);
    expect(r.truncated).toBe(false);
    // Windows must tile without gap or overlap, or rows are lost or doubled.
    expect(src.windows).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops on a short page rather than looping forever', async () => {
    const src = pageSource(10);
    const r = await readAllPages(src.build);
    expect(r.rows).toHaveLength(10);
    expect(r.pages).toBe(1);
  });

  it('handles an exact multiple of the page size', async () => {
    // 1000 rows means a full first page and an empty second — the case
    // an off-by-one gets wrong by stopping early or looping.
    const src = pageSource(1000);
    const r = await readAllPages(src.build);
    expect(r.rows).toHaveLength(1000);
    expect(r.pages).toBe(2);
    expect(r.truncated).toBe(false);
  });

  it('returns an empty result rather than throwing on no rows', async () => {
    const r = await readAllPages(() => Promise.resolve({ data: [], error: null }));
    expect(r.rows).toEqual([]);
    expect(r.error).toBeNull();
  });

  it('surfaces a read error and keeps what it already had', async () => {
    let n = 0;
    const r = await readAllPages<{ id: number }>(() => {
      n++;
      return Promise.resolve(n === 1
        ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }
        : { data: null, error: { message: 'statement timeout' } });
    });
    expect(r.error).toBe('statement timeout');
    expect(r.rows).toHaveLength(1000);
  });

  it('exposes data as an alias of rows', async () => {
    // The alias is what let 26 call sites convert by wrapping the query
    // and changing nothing else.
    const r = await readAllPages(pageSource(5).build);
    expect(r.data).toBe(r.rows);
  });

  it('reports truncation instead of presenting a partial read as complete', async () => {
    // An unstable sort can return a full page forever. Stopping silently
    // would be the same bug this module exists to remove.
    const r = await readAllPages(() =>
      Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }));
    expect(r.truncated).toBe(true);
    expect(r.rows.length).toBe(200_000);
  }, 30_000);
});
