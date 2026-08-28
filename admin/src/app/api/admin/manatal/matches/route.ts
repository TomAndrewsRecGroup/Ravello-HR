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

/** Ceiling on the per-candidate fallback read.
 *
 *  The bulk lookup is one call and usually names everybody. When it does
 *  not — a job created under a different Manatal organisation from the
 *  client's, or a v1 response shaped other than expected — this fills the
 *  gap one candidate at a time. Bounded because that is N calls: the
 *  first 40 unnamed rows get a name, the rest keep their id. Slow is
 *  worse than plain here, and a row is never dropped either way. */
const NAME_FALLBACK_LIMIT = 40;

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
  const unnamed = provisional.filter(r => !r.full_name).slice(0, NAME_FALLBACK_LIMIT);

  const extraNames = new Map<string, NamedCandidate>();
  if (unnamed.length > 0) {
    const fetched = await Promise.all(
      unnamed.map(r => getManatalCandidate(r.candidate_id).catch(() => null)),
    );
    for (const c of fetched) {
      if (c?.id) extraNames.set(manatalRefId(c.id), c as NamedCandidate);
    }
  }

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
