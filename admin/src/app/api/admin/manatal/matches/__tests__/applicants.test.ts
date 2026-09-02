// The applicants route, tested on the property that was wrong: TIME.
//
// Operator, 2026-09-02: "even applicants are not coming through."
//
// Every applicant was in Manatal throughout — 120 of them, up from the
// 69 this route was built against. The route named them one call each
// and declared no `maxDuration`, so it outgrew Vercel's default budget
// and 504'd. It did not return the wrong rows; it returned nothing.
//
// No correctness test could see that. The route's own row-building is
// pure and was always right (`manatalPipeline.test.ts` covers it), and
// against a stub that answers instantly, a route making 120 calls and a
// route making 2 look identical. So what is asserted here is the shape
// of the I/O — HOW MANY vendor calls, and whether the clock stops them
// — which is the only thing that was ever broken.
//
// Each assertion below was mutation-checked by reintroducing the bug
// and watching it fail:
//   - drop the deadline from hydrateNames   → "degrades" times out
//   - drop the v1 bulk read                 → "bulk read" sees 120 calls
//   - let a hydration miss drop the row     → "never drops a row" fails
//   - swallow the count                     → "reports" fails

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Recorder ─────────────────────────────────────────────── */

/** Every per-candidate call, in order. The number is the whole point. */
let candidateCalls: string[] = [];
/** How long each per-candidate read pretends to take. */
let candidateLatencyMs = 0;
/** Names the bulk v1 read is able to supply, by candidate id. */
let bulkNamed: Set<string> = new Set();

const JOB_ID = '4337074';
/** 120 applicants — the size at which the route actually broke. */
const APPLICANTS = Array.from({ length: 120 }, (_, i) => String(164000000 + i));

vi.mock('@/lib/manatal', async () => {
  const actual = await vi.importActual<typeof import('@/lib/manatal')>('@/lib/manatal');
  return {
    ...actual,
    isManatalConfigured: () => true,
    getManatalStages: () => Promise.resolve([{ id: 1, name: 'New Candidates' }]),

    // v3: the authoritative match list. Always complete.
    getManatalMatchesForJob: () => Promise.resolve({
      matches: APPLICANTS.map((cid, i) => ({
        id: 1000 + i, candidate: Number(cid), job: Number(JOB_ID),
        stage: { id: 1, name: 'New Candidates' },
        is_active: true, creator: null,
        created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z',
      })),
      truncated: false,
    }),

    // v1: names in bulk, candidate EXPANDED.
    getManatalMatchesForJobV1: () => Promise.resolve(
      [...bulkNamed].map((cid, i) => ({
        id: 2000 + i,
        candidate: { id: Number(cid), first_name: 'Bulk', last_name: `Named${cid}`, email: `${cid}@x.test` },
        job: Number(JOB_ID),
        stage: { id: 1, name: 'New Candidates' },
        is_active: true, creator: null,
        created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z',
      })),
    ),

    // v3 per candidate: one call each, and it respects a deadline the
    // way the real client does.
    getManatalCandidate: async (id: string | number, opts?: { deadline?: number }) => {
      candidateCalls.push(String(id));
      if (candidateLatencyMs) await new Promise(r => setTimeout(r, candidateLatencyMs));
      if (opts?.deadline && Date.now() > opts.deadline) return null;
      return { id: Number(id), full_name: `Individual ${id}`, email: `${id}@y.test` };
    },
  };
});

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve({ ok: true, userId: 'staff-1' }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data:  { id: 'req-1', manatal_job_id: JOB_ID, companies: { manatal_client_id: '8136723' } },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const REQ_ID = '7ae62d7d-491f-49e5-a250-b1816b6c9b03';

async function callRoute() {
  const { GET } = await import('../route');
  const req = { nextUrl: { searchParams: new URLSearchParams({ requisition_id: REQ_ID }) } };
  const res = await GET(req as never);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  candidateCalls = [];
  candidateLatencyMs = 0;
  bulkNamed = new Set();
  // HYDRATION_MS is read at module scope, so the budget an individual
  // test sets only takes effect on a fresh import.
  vi.resetModules();
});

/* ── The bulk read is what removes the per-applicant cost ── */

describe('names come from the bulk read, not one call each', () => {
  it('makes ZERO per-candidate calls when the bulk read names everybody', async () => {
    bulkNamed = new Set(APPLICANTS);

    const { status, body } = await callRoute();

    expect(status).toBe(200);
    expect(body.rows).toHaveLength(120);
    // The assertion. 120 here was the outage.
    expect(candidateCalls).toHaveLength(0);
    expect(body.name_source).toEqual({ bulk: 120, individual: 0, unresolved: 0 });
  });

  it('falls back per candidate ONLY for whoever the bulk read missed', async () => {
    bulkNamed = new Set(APPLICANTS.slice(0, 115));   // five missing

    const { body } = await callRoute();

    expect(candidateCalls.sort()).toEqual(APPLICANTS.slice(115).sort());
    expect(body.name_source).toEqual({ bulk: 115, individual: 5, unresolved: 0 });
    expect(body.rows.every((r: any) => r.full_name)).toBe(true);
  });
});

/* ── The deadline is what stops this ever taking the page down ── */

describe('a slow vendor costs names, never the page', () => {
  it('degrades to bare ids instead of running until the platform kills it', async () => {
    // Nothing named in bulk and every individual read slow: the shape
    // that produced the 504. 120 × 40ms serial-ish ≈ 4.8s; the route's
    // hydration budget must cut it off long before that.
    vi.stubEnv('MANATAL_HYDRATION_BUDGET_MS', '300');
    candidateLatencyMs = 40;

    const started = Date.now();
    const { status, body } = await callRoute();
    const elapsed = Date.now() - started;

    expect(status).toBe(200);
    // The page still renders EVERY applicant …
    expect(body.rows).toHaveLength(120);
    // … it just could not name them all, and says so.
    expect(body.unresolved_names).toBeGreaterThan(0);
    expect(body.name_source.unresolved).toBe(body.unresolved_names);
    // And it stopped issuing calls rather than working through all 120.
    expect(candidateCalls.length).toBeLessThan(120);
    // Bounded well inside the platform default that was being exceeded.
    expect(elapsed).toBeLessThan(10_000);

    vi.unstubAllEnvs();
  });
});

/* ── The rule this route already had, still holding ── */

describe('hydration is a label, never a filter', () => {
  it('never drops a row for want of a name', async () => {
    // Nobody nameable from either source.
    bulkNamed = new Set();
    vi.stubEnv('MANATAL_HYDRATION_BUDGET_MS', '0');   // deadline already passed

    const { body } = await callRoute();

    expect(body.rows).toHaveLength(120);
    expect(body.rows.map((r: any) => r.candidate_id).sort()).toEqual([...APPLICANTS].sort());
    expect(body.unresolved_names).toBe(120);

    vi.unstubAllEnvs();
  });

  it('reports the count rather than presenting ids as names', async () => {
    bulkNamed = new Set(APPLICANTS.slice(0, 60));
    vi.stubEnv('MANATAL_HYDRATION_BUDGET_MS', '0');

    const { body } = await callRoute();

    expect(body.unresolved_names).toBe(60);
    expect(body.name_source.bulk).toBe(60);

    vi.unstubAllEnvs();
  });
});
