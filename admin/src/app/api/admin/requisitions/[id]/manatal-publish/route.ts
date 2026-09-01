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
import { logPublishStep } from '@/lib/manatalPublishLog';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bumped whenever this handler changes shape. It goes into every log
// row and every response, so "is the deployed route the one I am
// reading?" is answerable from data instead of argued about. Two
// rounds of this were spent unable to tell a stale deploy from a bug.
const ROUTE_VERSION = 'manatal-publish/4';

/** Log a pre-Manatal exit and answer with the same reason. Every early
 *  return went through neither before, so an empty log read as "the
 *  button was never pressed" when it actually meant "we stopped in the
 *  first ten lines". */
async function refuse(
  requisitionId: string,
  status: number,
  message: string,
  actorId?: string | null,
) {
  const logged = await logPublishStep({
    requisitionId, actorId, step: 'precondition', ok: false,
    httpStatus: status, message: `[${ROUTE_VERSION}] ${message}`,
  });
  return NextResponse.json({ error: message, route_version: ROUTE_VERSION, logged }, { status });
}

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
  if (!rl.allowed) {
    await logPublishStep({
      requisitionId: params.id, actorId: auth.userId, step: 'precondition', ok: false,
      httpStatus: 429, message: `[${ROUTE_VERSION}] rate limited`,
    });
    return rateLimitResponse(rl.resetAt);
  }
  if (!UUID_RE.test(params.id)) {
    // Not logged: the id is the log's own foreign key, so there is
    // nothing to attach a row to.
    return NextResponse.json({ error: 'Invalid id', route_version: ROUTE_VERSION }, { status: 400 });
  }

  if (!isManatalConfigured()) {
    return refuse(params.id, 503,
      'MANATAL_API_KEY is not set on the admin app, so nothing can be sent to Manatal.',
      auth.userId);
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
  // A FAILED read and a MISSING role are different faults and must not
  // share an answer. This select names five columns added by migration
  // 083; until PostgREST reloads its schema cache it answers 400
  // "column ... does not exist", and reporting that as "Requisition not
  // found" sends whoever is debugging it looking for a deleted role
  // instead of a stale cache.
  if (loadErr) {
    return refuse(params.id, 500, `Could not read the requisition: ${loadErr.message}`, auth.userId);
  }
  if (!req) {
    return refuse(params.id, 404, 'Requisition not found', auth.userId);
  }

  // The PostgREST embed returns the FK relation as an object or, in
  // older typings, an array. Handle both shapes defensively.
  const companyRel = (req as any).companies;
  const organizationId: string | null = Array.isArray(companyRel)
    ? companyRel[0]?.manatal_client_id ?? null
    : companyRel?.manatal_client_id ?? null;
  if (!organizationId) {
    return refuse(params.id, 400,
      "This client isn't linked to Manatal yet — set manatal_client_id on the client profile.",
      auth.userId);
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
    const updErrDetail = updated ? null : lastManatalError();
    await logPublishStep({
      requisitionId: params.id, actorId: auth.userId, step: 'update', ok: updated,
      manatalJobId: jobId, httpStatus: updErrDetail?.status ?? 200,
      message: updErrDetail?.message ?? null, sent: jobArgs,
    });
    if (!updated) {
      const err = updErrDetail;
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
    const createErr = created?.id ? null : lastManatalError();
    await logPublishStep({
      requisitionId: params.id, actorId: auth.userId, step: 'create', ok: Boolean(created?.id),
      manatalJobId: created?.id ?? null, httpStatus: createErr?.status ?? 201,
      message: createErr?.message ?? null, sent: jobArgs,
    });
    if (!created?.id) {
      return NextResponse.json({ error: createErr?.message ?? 'Manatal job create failed.' }, { status: 502 });
    }
    jobId = created.id;
    // Persist the new job id immediately, BEFORE we attempt publish.
    // If publish fails (network blip etc.) a retry of this endpoint
    // will see the stored id and skip create — no duplicate Manatal
    // jobs. manatal_published_at stays null until publish succeeds.
    // `.select()` is not decoration. A supabase UPDATE that matches NO
    // rows — because RLS refused it, say — returns `error: null` and
    // reports success, so the route would answer 200 while the row
    // never changed. Asking for the affected row back is the only way
    // to tell "written" from "silently discarded".
    const { data: stamped, error: stampErr } = await supabase
      .from('requisitions')
      .update({ manatal_job_id: jobId })
      .eq('id', req.id)
      .select('id');
    if (!stampErr && (stamped?.length ?? 0) === 0) {
      await logPublishStep({
        requisitionId: params.id, actorId: auth.userId, step: 'create', ok: false,
        manatalJobId: jobId, httpStatus: 500,
        message: `[${ROUTE_VERSION}] job created in Manatal but the local UPDATE matched no rows (RLS?)`,
      });
      return NextResponse.json({
        error: `Created Manatal job ${jobId} but could not record it locally — the update matched no rows.`,
        manatal_job_id: jobId, route_version: ROUTE_VERSION,
      }, { status: 500 });
    }
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
  const pubErr = published ? null : lastManatalError();
  await logPublishStep({
    requisitionId: params.id, actorId: auth.userId, step: 'publish', ok: published,
    manatalJobId: jobId, httpStatus: pubErr?.status ?? 200, message: pubErr?.message ?? null,
  });
  if (!published) {
    const err = pubErr;
    return NextResponse.json({
      error: err?.message ?? 'Manatal job publish failed.',
      manatal_job_id: jobId,
    }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { data: finalised, error: updErr } = await supabase
    .from('requisitions')
    .update({ manatal_job_id: jobId, manatal_published_at: now })
    .eq('id', req.id)
    .select('id');
  // Same trap as above, and the one that matters most: without this the
  // route reports a successful publish while manatal_published_at stays
  // at whatever it was — which is precisely the symptom being chased.
  if (!updErr && (finalised?.length ?? 0) === 0) {
    await logPublishStep({
      requisitionId: params.id, actorId: auth.userId, step: 'publish', ok: false,
      manatalJobId: jobId, httpStatus: 500,
      message: `[${ROUTE_VERSION}] published in Manatal but the local UPDATE matched no rows (RLS?)`,
    });
    return NextResponse.json({
      error: 'Published in Manatal but could not record it locally — the update matched no rows.',
      manatal_job_id: jobId, route_version: ROUTE_VERSION,
    }, { status: 500 });
  }
  if (updErr) {
    return NextResponse.json({
      error: `Published in Manatal but local update failed: ${updErr.message}`,
      manatal_job_id: jobId,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true, manatal_job_id: jobId, manatal_published_at: now,
    route_version: ROUTE_VERSION,
  });
}


// GET /api/admin/requisitions/[id]/manatal-publish
//
// A readiness check. It answers every question the POST would answer by
// failing, WITHOUT contacting Manatal or writing anything — so it is
// safe to press repeatedly and costs no vendor call.
//
// It exists because three rounds of diagnosis were spent unable to tell
// which precondition was refusing: the POST reported its reason only in
// the browser, an empty log was indistinguishable from a button never
// pressed, and a stale deploy looked identical to a bug. Each of those
// is now one value in this response.
export async function GET(httpReq: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;   // a 401/403 here IS the answer

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id', route_version: ROUTE_VERSION }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: req, error: loadErr } = await supabase
    .from('requisitions')
    .select('id,title,manatal_job_id,salary_currency,salary_period,salary_visible,headcount,manatal_industry_id,companies(manatal_client_id)')
    .eq('id', params.id)
    .single();

  const companyRel = (req as any)?.companies;
  const organizationId: string | null = Array.isArray(companyRel)
    ? companyRel[0]?.manatal_client_id ?? null
    : companyRel?.manatal_client_id ?? null;

  // Whether the diagnostic table itself is writable. If this is false,
  // an empty publish log means nothing at all — which is exactly how
  // the last round was misread.
  const logWritable = await logPublishStep({
    requisitionId: params.id, actorId: auth.userId, step: 'precondition', ok: true,
    httpStatus: 200, message: `[${ROUTE_VERSION}] readiness check`,
  });

  const checks = {
    route_version:        ROUTE_VERSION,
    staff_session:        true,
    manatal_key_present:  isManatalConfigured(),
    requisition_readable: !loadErr && Boolean(req),
    read_error:           loadErr?.message ?? null,
    // The five columns migration 083 added. `null` is a legitimate
    // unset; `undefined` means the column did not come back at all,
    // which is a schema problem rather than an empty field.
    new_columns_present:  req ? ['salary_currency','salary_period','salary_visible','headcount','manatal_industry_id']
                                  .every(k => k in (req as Record<string, unknown>)) : false,
    client_linked:        Boolean(organizationId),
    manatal_organization: organizationId,
    manatal_job_id:       (req as any)?.manatal_job_id ?? null,
    would_do:             (req as any)?.manatal_job_id ? 'update then publish' : 'create then publish',
    publish_log_writable: logWritable,
  };

  const ready = checks.manatal_key_present && checks.requisition_readable && checks.client_linked;
  return NextResponse.json({ ready, ...checks });
}
