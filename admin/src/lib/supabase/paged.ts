// Exhaustive reads that actually read everything.
//
// Supabase caps every PostgREST response at a server-side Max Rows
// value — 1,000 by default. Neither `.limit(5000)` nor
// `.range(0, 99999)` raises it: `limit` is a query parameter the server
// clamps, and `Range` is a window WITHIN the cap. The only way past it
// is more than one request.
//
// This codebase had 31 queries asking for more than 1,000 rows,
// including both CSV export pages and the Value Reports page — the
// artefact that justifies the fee. A client exporting "all candidates"
// would receive 1,000, with no warning, no error, and nothing anywhere
// reporting a fault. The tables are empty today, so it is invisible; it
// becomes wrong the moment a client passes 1,000 rows and stays wrong
// silently.
//
// TWO RULES WORTH KNOWING
//
// 1. A paged read MUST carry a stable, unique sort key. Paging walks
//    Range windows, and without a deterministic total order Postgres
//    may order two pages differently — silently dropping or duplicating
//    rows across the boundary. `created_at` alone is NOT enough: an
//    import writes many rows in the same millisecond. Pass a tie-break.
//
// 2. For a COUNT, never fetch-and-length. `count: 'exact', head: true`
//    is answered server-side and is immune to the cap.

const PAGE_SIZE = 1000;

/** Refuse to loop forever if a caller passes an unstable sort and the
 *  same page keeps coming back. 200k rows is far beyond any real export
 *  here and is a bug signal, not a limit to raise. */
const MAX_ROWS = 200_000;

export interface PagedResult<T> {
  rows: T[];
  /** Alias for `rows`.
   *
   *  Exists so a `.limit(5000)` call site converts by wrapping the query
   *  and nothing else — `xRes.data ?? []` keeps working. That kept the
   *  conversion of 26 sites mechanical and low-risk. Where truncation or
   *  a read error actually matters to the user (the CSV export pages),
   *  read `truncated` and `error` explicitly instead. */
  data: T[];
  /** True when MAX_ROWS stopped the walk. The caller should surface
   *  this rather than present a truncated export as complete — that is
   *  the exact failure this module exists to remove. */
  truncated: boolean;
  pages: number;
  error: string | null;
}

/** Build a query for one window. Called once per page.
 *
 *  It MUST apply a stable, unique `.order(...)` — see rule 1. The helper
 *  cannot add it for you because only the caller knows the table's keys. */
export type PageQueryBuilder = (from: number, to: number) => PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
}>;

/** Walk every page of an exhaustive read.
 *
 *  Returns rather than throws: an export that fails should say so in the
 *  UI, not blank the page. */
export async function readAllPages<T>(build: PageQueryBuilder): Promise<PagedResult<T>> {
  const rows: T[] = [];
  let pages = 0;

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await build(from, to);
    pages++;

    if (error) {
      return { rows, data: rows, truncated: false, pages, error: error.message };
    }

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    // A short page is the last page. This is the only reliable
    // termination signal — PostgREST does not tell us the total unless
    // we ask for a count, and asking on every page doubles the work.
    if (batch.length < PAGE_SIZE) {
      return { rows, data: rows, truncated: false, pages, error: null };
    }
  }

  console.error(JSON.stringify({
    _audit: true, action: 'paged.read.truncated', rows: rows.length, max: MAX_ROWS,
  }));
  return { rows, data: rows, truncated: true, pages, error: null };
}

/** Exact row count, answered server-side.
 *
 *  Immune to the row cap, unlike counting what a select returned — which
 *  is how a 2,577-client book came to report exactly 1000. */
export async function countExact(
  build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number | null> {
  const { count, error } = await build();
  return error ? null : count;
}
