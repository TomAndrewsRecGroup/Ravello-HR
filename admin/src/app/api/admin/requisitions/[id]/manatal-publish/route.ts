import { NextResponse, type NextRequest } from 'next/server';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import {
  isManatalConfigured,
  createManatalJob,
  updateManatalJob,
  publishManatalJob,
  lastManatalError,
} from '@/lib/manatal';
import { buildManatalJobArgs, type RequisitionForManatal } from '@/lib/manatalJobFields';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/requisitions/[id]/manatal-publish
// Pushes a requisition to Manatal: creates the job under the client's
// Manatal organization, then publishes it (Careers page + free job
// boards). Writes manatal_job_id + manatal_published_at back on the
// requisition. Idempotent re-publish is supported — if a job id
// already exists the route just toggles publish on it again.
export async function POST(httpReq: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // Ceiling on a metered/outbound action. Keyed by user rather
  // than IP so one person's bulk run does not throttle the office.
  const rl = limiters.vendor.check(getUserRateLimitKey(httpReq, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  if (!isManatalConfigured()) {
    return NextResponse.json({ error: 'Manatal is not configured on this environment.' }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const { data: req, error: loadErr } = await supabase
    .from('requisitions')
    // ONE string literal, deliberately. supabase-js infers the row type
    // from the literal type of this argument, so splitting it with `+`
    // widens it to `string` and every field access below becomes an
    // error on GenericStringError.
    .select('id,title,description,location,employment_type,seniority,working_model,salary_min,salary_max,salary_range,salary_currency,salary_period,salary_visible,headcount,manatal_industry_id,must_haves,nice_to_haves,manatal_job_id,companies(manatal_client_id)')
    .eq('id', params.id)
    .single();
  if (loadErr || !req) {
    return NextResponse.json({ error: loadErr?.message ?? 'Requisition not found' }, { status: 404 });
  }

  // The PostgREST embed returns the FK relation as an object or, in
  // older typings, an array. Handle both shapes defensively.
  const companyRel = (req as any).companies;
  const organizationId: string | null = Array.isArray(companyRel)
    ? companyRel[0]?.manatal_client_id ?? null
    : companyRel?.manatal_client_id ?? null;
  if (!organizationId) {
    return NextResponse.json({
      error: "This client isn't linked to Manatal yet — set manatal_client_id on the client profile.",
    }, { status: 400 });
  }

  // Reuse an existing job id if the requisition was already pushed,
  // otherwise create a new one. The publish step runs in both branches
  // so admins can re-publish if Manatal lost the toggle.
  let jobId: string | null = req.manatal_job_id ?? null;
  const jobArgs = buildManatalJobArgs(req as RequisitionForManatal, organizationId);

  if (jobId) {
    // Push the current field values BEFORE re-publishing. Without this,
    // "Re-publish" only toggled the publish flags: a corrected salary
    // or description never reached Manatal and the button still
    // reported success.
    const updated = await updateManatalJob(jobId, jobArgs);
    if (!updated) {
      const err = lastManatalError();
      return NextResponse.json({
        error: err?.message ?? 'Manatal job update failed.',
        manatal_job_id: jobId,
      }, { status: 502 });
    }
  }

  if (!jobId) {
    // Every field mapping lives in buildManatalJobArgs, so what we send
    // Manatal is one testable value rather than a shape assembled
    // inside a handler behind auth, a rate limiter and a DB read.
    const created = await createManatalJob(jobArgs);
    if (!created?.id) {
      const err = lastManatalError();
      return NextResponse.json({ error: err?.message ?? 'Manatal job create failed.' }, { status: 502 });
    }
    jobId = created.id;
    // Persist the new job id immediately, BEFORE we attempt publish.
    // If publish fails (network blip etc.) a retry of this endpoint
    // will see the stored id and skip create — no duplicate Manatal
    // jobs. manatal_published_at stays null until publish succeeds.
    const { error: stampErr } = await supabase
      .from('requisitions')
      .update({ manatal_job_id: jobId })
      .eq('id', req.id);
    if (stampErr) {
      // Soft-fail: the job exists in Manatal, our local row didn't
      // record it. Tell the caller so they can reconcile manually.
      return NextResponse.json({
        error: `Created in Manatal but local update failed: ${stampErr.message}`,
        manatal_job_id: jobId,
      }, { status: 500 });
    }
  }

  const published = await publishManatalJob(jobId);
  if (!published) {
    const err = lastManatalError();
    return NextResponse.json({
      error: err?.message ?? 'Manatal job publish failed.',
      manatal_job_id: jobId,
    }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('requisitions')
    .update({ manatal_job_id: jobId, manatal_published_at: now })
    .eq('id', req.id);
  if (updErr) {
    return NextResponse.json({
      error: `Published in Manatal but local update failed: ${updErr.message}`,
      manatal_job_id: jobId,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, manatal_job_id: jobId, manatal_published_at: now });
}
