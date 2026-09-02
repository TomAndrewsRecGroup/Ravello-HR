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
// names and emails are hydrated from the v1 org-wide read in one extra
// call. That hydration is best-effort: a candidate it cannot name still
// appears, identified by id. An applicant silently missing from this
// list would be the worst outcome, so nothing is dropped for want of a
// name.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import {
  getManatalCandidate,
  getManatalMatches,
  getManatalMatchesForJob,
  getManatalStages,
  isManatalConfigured,
  manatalRefId,
} from '@/lib/manatal';
import { buildPipelineRows, type NamedCandidate } from '@/lib/manatalPipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ceiling on the per-candidate hydration.
 *
 *  MEASURED 2026-09-02 on job 4337074: 69 job-board applicants, and the
 *  bulk lookup named NONE of them. It calls `/matches/` with
 *  `department_id: <organization id>` — a department is not an
 *  organisation, so the filter matches nothing — and it does not page.
 *  Everybody therefore fell through to this fallback, which was capped
 *  at 40, leaving 29 applicants shown as bare ids.
 *
 *  The v3 per-candidate read is the one that provably works: it is what
 *  the referral pipeline uses, and it returns `full_name` for every
 *  applicant checked. So it is now the primary path rather than a
 *  patch over the bulk read, and the ceiling is high enough to name a
 *  whole role's pipeline.
 *
 *  Still bounded, because it is N calls and an unbounded loop over a
 *  viral job posting would hang the page. A row is never dropped for
 *  want of a name either way. */
const NAME_FALLBACK_LIMIT = 300;

/** How many candidate reads are in flight at once.
 *
 *  Serial was never viable at this size (69 × ~700ms ≈ 48s, past the
 *  function's own budget); unbounded `Promise.all` over 300 would open
 *  300 sockets to a vendor that rate-limits. Eight is the same shape
 *  the referral pipeline's pooled research uses. */
const NAME_CONCURRENCY = 8;

/** Resolve names in bounded batches, preserving "never drop a row". */
async function hydrateNames(ids: string[]): Promise<Map<string, NamedCandidate>> {
  const out = new Map<string, NamedCandidate>();
  for (let i = 0; i < ids.length; i += NAME_CONCURRENCY) {
    const slice = ids.slice(i, i + NAME_CONCURRENCY);
    const fetched = await Promise.all(
      slice.map(id => getManatalCandidate(id).catch(() => null)),
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

  const companyRel = (row as any).companies;
  const organizationId: string | null = Array.isArray(companyRel)
    ? companyRel[0]?.manatal_client_id ?? null
    : companyRel?.manatal_client_id ?? null;

  const [{ matches, truncated }, stages, orgMatches] = await Promise.all([
    getManatalMatchesForJob(jobId),
    getManatalStages(),
    // Name/email hydration only. Failure here costs labels, not rows.
    organizationId ? getManatalMatches(organizationId).catch(() => []) : Promise.resolve([]),
  ]);

  // Anyone the bulk lookup could not name, resolved individually. This
  // is the difference between a readable table and a page of
  // "Candidate #163544005" — see NamedCandidate for why the bulk read
  // cannot be relied on alone.
  const provisional = buildPipelineRows(matches, orgMatches);
  const unnamed = provisional
    .filter(r => !r.full_name)
    .slice(0, NAME_FALLBACK_LIMIT)
    .map(r => r.candidate_id);

  const extraNames = unnamed.length > 0 ? await hydrateNames(unnamed) : new Map<string, NamedCandidate>();

  const rows = extraNames.size > 0
    ? buildPipelineRows(matches, orgMatches, extraNames)
    : provisional;

  // Reported so a table full of ids is a visible condition rather than
  // something the operator has to guess at.
  const unresolvedNames = rows.filter(r => !r.full_name).length;

  return NextResponse.json({
    rows,
    stages,
    state: 'ok',
    unresolved_names: unresolvedNames,
    // Surfaced rather than swallowed: a partial read presented as a
    // complete one is how "everyone applied" quietly stops being true.
    truncated,
  }, {
    // Never CDN-shared: this is one client's applicant list.
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
