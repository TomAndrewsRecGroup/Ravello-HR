// GET /api/admin/manatal/matches?requisition_id=<uuid>
//
// The applicants on ONE role's Manatal job, for the admin app.
//
// The portal has had this since Phase 31; admin had no equivalent, so
// staff could publish a role to Manatal and then had no way to see who
// had applied to it without opening Manatal itself. Everything the
// referral pipeline decides was visible; the raw pipeline it decides
// over was not.
//
// SCOPING IS THE DIFFERENCE FROM THE PORTAL VERSION. The portal resolves
// the Manatal id from the caller's OWN company, which is the whole
// tenant boundary. An admin has no single company, so the scope has to
// come from the request — and it is taken from the requisition row
// rather than from a caller-supplied Manatal id, so nobody can ask for
// an arbitrary organisation's applicants by guessing a number.
//
// The match list is read job-scoped over v3 (`getManatalMatchesForJob`),
// which is paginated and is the same read the referral cron uses — so
// this page shows exactly the set the pipeline considers, not a
// differently-filtered one. v3 returns `candidate` as a BARE ID, so
// names and emails are hydrated separately. That hydration is
// best-effort: a candidate it cannot name still appears, identified by
// id. An applicant silently missing from this list would be the worst
// outcome, so nothing is dropped for want of a name.
//
// ── HYDRATION IS ON A CLOCK, AND THAT IS THE POINT (2026-09-02) ──
//
// Operator: "even applicants are not coming through."
//
// Every applicant was present in Manatal the whole time — measured: 120
// matches on job 4337074, up from the 69 this route was built against.
// The route named them ONE CALL EACH, at ~700ms, eight at a time, and
// declared no `maxDuration` — so it ran under Vercel's default budget.
// Fifteen batches did not fit where nine had. The page did not degrade;
// it 504'd, and an operator with 120 applicants saw fewer than one with
// 69.
//
// Two changes, and the second matters more than the first:
//
//   1. Names come from a job-scoped v1 read, where the candidate is
//      EXPANDED — ceil(N/100) calls instead of N.
//   2. Hydration has a WALL-CLOCK DEADLINE. Past it, the remaining rows
//      render as bare ids and `unresolved_names` says how many.
//
// (1) alone would have fixed today and re-broken at some larger N,
// because it leaves the failure mode as "the page dies". The rule this
// route already had — never drop a row for want of a name — extends to
// never dropping the PAGE for want of names. A label is not worth a
// blank screen, and the route now cannot spend more than its budget
// discovering that.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import {
  getManatalCandidate,
  getManatalMatchesForJob,
  getManatalMatchesForJobV1,
  getManatalStages,
  isManatalConfigured,
  manatalRefId,
} from '@/lib/manatal';
import { buildPipelineRows, type NamedCandidate } from '@/lib/manatalPipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Declared, because the default is not ours to rely on.
 *
 *  The route ran under Vercel's project default until 2026-09-02 and
 *  silently outgrew it. The budget below is the ceiling; HYDRATION_MS
 *  is what the route actually spends, and it is deliberately far
 *  smaller — the deadline is meant to bite long before the platform's
 *  does, because one is a degraded page and the other is a dead one. */
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The whole labelling budget, bulk read and fallback together.
 *
 *  Sized well under `maxDuration` on purpose. Everything this budget
 *  buys is a display name; the rows, the stages and the counts are
 *  already in hand before it starts, so overrunning it can only ever
 *  cost labels — and running out of it must cost labels rather than
 *  the response. */
const HYDRATION_MS = Number(process.env.MANATAL_HYDRATION_BUDGET_MS ?? 20_000);

/** Ceiling on the per-candidate fallback.
 *
 *  MEASURED 2026-09-02 on job 4337074: the v3 per-candidate read names
 *  every applicant checked, and it is what the referral pipeline runs
 *  on — so it is a trustworthy fallback. It is also ONE CALL EACH, and
 *  at 120 applicants that is what broke this route. It now runs only
 *  for whoever the bulk read missed, and only while the deadline
 *  holds. */
const NAME_FALLBACK_LIMIT = 300;

/** How many candidate reads are in flight at once.
 *
 *  Serial was never viable at this size (120 × ~700ms ≈ 84s); an
 *  unbounded `Promise.all` over 300 would open 300 sockets to a vendor
 *  that rate-limits. Eight is the same shape the referral pipeline's
 *  pooled research uses. */
const NAME_CONCURRENCY = 8;

/** Resolve names in bounded batches, preserving "never drop a row".
 *
 *  Checks the clock BETWEEN batches, not only at the start: a caller
 *  that has already spent the budget must issue no further calls, and
 *  a batch that overruns must not be followed by another. Returning
 *  early here is a partial answer by design — the caller counts what
 *  is missing and says so. */
async function hydrateNames(ids: string[], deadline: number): Promise<Map<string, NamedCandidate>> {
  const out = new Map<string, NamedCandidate>();
  for (let i = 0; i < ids.length; i += NAME_CONCURRENCY) {
    if (Date.now() >= deadline) break;
    const slice = ids.slice(i, i + NAME_CONCURRENCY);
    const fetched = await Promise.all(
      slice.map(id => getManatalCandidate(id, { deadline }).catch(() => null)),
    );
    for (const c of fetched) {
      if (c?.id) out.set(manatalRefId(c.id), c as NamedCandidate);
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const requisitionId = req.nextUrl.searchParams.get('requisition_id') ?? '';
  if (!UUID_RE.test(requisitionId)) {
    return NextResponse.json({ error: 'A valid requisition_id is required' }, { status: 400 });
  }

  if (!isManatalConfigured()) {
    return NextResponse.json({ rows: [], stages: [], state: 'not_configured' });
  }

  const supabase = createServerSupabaseClient();
  const { data: row, error } = await supabase
    .from('requisitions')
    .select('id,manatal_job_id,companies(manatal_client_id)')
    .eq('id', requisitionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row)   return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

  const jobId = (row as { manatal_job_id: string | null }).manatal_job_id;
  if (!jobId) {
    // Distinct from "no applicants": the role has never been pushed, so
    // there is nowhere for an applicant to have come from.
    return NextResponse.json({ rows: [], stages: [], state: 'not_published' });
  }

  const deadline = Date.now() + HYDRATION_MS;

  const [{ matches, truncated }, stages, namedMatches] = await Promise.all([
    getManatalMatchesForJob(jobId),
    getManatalStages(),
    // Name/email hydration only. Failure here costs labels, not rows —
    // so it is job-scoped like the read above, deadline-bounded, and
    // never allowed to reject.
    getManatalMatchesForJobV1(jobId, { deadline }).catch(() => []),
  ]);

  // Anyone the bulk read could not name, resolved individually — the
  // difference between a readable table and a page of
  // "Candidate #163544005". Bounded twice over: by a count, because it
  // is one call each, and by the clock, because a vendor having a slow
  // afternoon must cost names and not the page.
  const provisional  = buildPipelineRows(matches, namedMatches);
  const namedInBulk  = provisional.filter(r => r.full_name).length;
  const unnamed      = provisional
    .filter(r => !r.full_name)
    .slice(0, NAME_FALLBACK_LIMIT)
    .map(r => r.candidate_id);

  const extraNames = unnamed.length > 0
    ? await hydrateNames(unnamed, deadline)
    : new Map<string, NamedCandidate>();

  const rows = extraNames.size > 0
    ? buildPipelineRows(matches, namedMatches, extraNames)
    : provisional;

  // Reported so a table full of ids is a visible condition rather than
  // something the operator has to guess at.
  const unresolvedNames = rows.filter(r => !r.full_name).length;

  return NextResponse.json({
    rows,
    stages,
    state: 'ok',
    unresolved_names: unresolvedNames,
    /** Where the names came from.
     *
     *  Not decoration: whether the v1 read honours `job_id` could not
     *  be verified from outside the deployment, and this is the
     *  measurement that settles it. `bulk` climbing with `individual`
     *  at zero means it works; the reverse means v1 rejected or
     *  ignored the filter and the fallback is carrying the page. */
    name_source: {
      bulk:       namedInBulk,
      individual: rows.filter(r => r.full_name).length - namedInBulk,
      unresolved: unresolvedNames,
    },
    // Surfaced rather than swallowed: a partial read presented as a
    // complete one is how "everyone applied" quietly stops being true.
    truncated,
  }, {
    // Never CDN-shared: this is one client's applicant list.
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
