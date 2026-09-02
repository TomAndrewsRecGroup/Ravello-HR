// Hourly referral pipeline run.
//
// Reads job-board applicants out of Manatal for every referral-enabled
// role, gates them (country → scan → mandatory criteria → score) and
// emails the ones that qualify — unless the role is still in dry run,
// which is the default.
//
// Schedule: admin/vercel.json, "0 * * * *".
// Auth: CRON_SECRET, same shape as the other two crons.
//
// Idempotency lives in the database: referral_applications carries
// UNIQUE (manatal_candidate_id, requisition_id), and processRole drops
// anyone already holding a row before doing any work. Re-invoking this
// route immediately is a no-op, which is also how you verify it.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_BATCH_CAP,
  RUN_BUDGET_MS,
  emptyTally,
  processRole,
  type RoleRow,
} from '@/lib/referral/pipeline';
import { breakerSnapshot } from '@/lib/http/resilient';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** One row per invocation, whatever happens.
 *
 *  The route's tally went to a console log, which cannot be queried.
 *  Four hours of zero applications could not be told apart from four
 *  hours of the cron never firing. Best-effort: a logging failure must
 *  not fail a run that already did its work. */
async function recordRun(
  sb: ReturnType<typeof serviceClient> | null,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    const client = sb ?? serviceClient();
    await client.from('referral_scan_runs').insert(row);
  } catch { /* see above */ }
}

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function run(req: NextRequest) {
  const startedAt = Date.now();
  if (!authorize(req)) {
    // Recorded ONLY when the secret is missing from the environment —
    // that is a misconfiguration, and it is the difference between "the
    // cron never fired" and "it fired and we turned it away". An
    // arbitrary 401 is a caller, and logging those would let anyone
    // fill the table.
    if (!process.env.CRON_SECRET) {
      await recordRun(null, {
        ok: false, outcome: 'unauthorized', duration_ms: Date.now() - startedAt,
        notes: ['CRON_SECRET is not set on this environment, so every scheduled run is refused.'],
      });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ranAt = new Date().toISOString();
  const capParam = Number(req.nextUrl.searchParams.get('cap') ?? DEFAULT_BATCH_CAP);
  const cap = Number.isFinite(capParam) && capParam > 0 ? Math.min(capParam, 200) : DEFAULT_BATCH_CAP;

  let supabase;
  try {
    supabase = serviceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const { data: roles, error } = await supabase
    .from('referral_role_config')
    .select(`
      requisition_id, enabled, dry_run, partner_name, referral_url, email_process_note,
      auto_send_threshold, review_threshold, approved_countries, mandatory_criteria,
      requisition:requisitions!inner (
        id, title, company_id, manatal_job_id, ivylens_role_id, jd_text, description
      )
    `)
    .eq('enabled', true);

  if (error) {
    console.error(JSON.stringify({
      _audit: true, action: 'cron.referral.failed', error: error.message, ran_at: ranAt,
    }));
    await recordRun(supabase, {
      ok: false, outcome: 'error', duration_ms: Date.now() - startedAt,
      notes: [`Could not read referral_role_config: ${error.message}`],
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tally = emptyTally();

  if (!roles?.length) {
    console.log(JSON.stringify({
      _audit: true, action: 'cron.referral.noop', reason: 'no enabled referral roles', ran_at: ranAt,
    }));
    // A healthy zero, recorded. Without this row it is identical to a
    // cron that never fired.
    await recordRun(supabase, {
      ok: true, outcome: 'no_roles', duration_ms: Date.now() - startedAt,
      notes: ['No referral-enabled roles to scan.'],
    });
    return NextResponse.json({ ran_at: ranAt, ...tally });
  }

  // Two ceilings: a candidate count and a wall clock. maxDuration is
  // 300s and being killed mid-write loses the tally, which is what turns
  // "0 emailed" into a mystery rather than a number.
  const budget = { left: cap, deadline: Date.now() + RUN_BUDGET_MS };

  // Roles are processed in sequence rather than in parallel: they share
  // one Manatal rate-limit budget and one IvyLens partner key, and the
  // batch cap is global. Parallelism here would buy little and risk 429s.
  for (const raw of roles) {
    // PostgREST types an !inner embed as an array; it is one row.
    const requisition = Array.isArray((raw as any).requisition)
      ? (raw as any).requisition[0]
      : (raw as any).requisition;
    if (!requisition) {
      tally.roles_skipped++;
      tally.notes.push('A referral config had no matching requisition and was skipped.');
      continue;
    }
    try {
      await processRole(supabase, { ...(raw as any), requisition } as RoleRow, tally, budget);
    } catch (err) {
      // One bad role must not take the rest of the run with it.
      tally.roles_skipped++;
      tally.notes.push(`Role "${requisition.title}" failed: ${(err as Error)?.message}`);
    }
  }

  // Fail the HTTP response when a material share of the work errored, so
  // Vercel's cron monitoring surfaces it. Mirrors ingest-feeds' >50% rule.
  // Judged over ATTEMPTED candidates only: a quiet hour with nothing to do
  // is a healthy zero, not a failure.
  const attempted = tally.scanned + tally.scan_errors;
  const unhealthy =
    (attempted > 0 && tally.scan_errors / attempted > 0.5) ||
    (tally.roles_considered === 0 && tally.roles_skipped > 0);

  tally.vendor_breakers = breakerSnapshot();
  const payload = { ran_at: ranAt, cap, ...tally };

  console.log(JSON.stringify({
    _audit: true,
    action: unhealthy ? 'cron.referral.degraded' : 'cron.referral.ok',
    ...payload,
  }));

  await recordRun(supabase, {
    ok: !unhealthy,
    outcome: unhealthy ? 'degraded' : 'ok',
    duration_ms:      Date.now() - startedAt,
    roles_considered: tally.roles_considered,
    roles_skipped:    tally.roles_skipped,
    matches_seen:     tally.matches_seen,
    scanned:          tally.scanned,
    emailed:          tally.emailed ?? 0,
    tally:            payload,
    notes:            tally.notes,
  });

  return NextResponse.json(payload, { status: unhealthy ? 500 : 200 });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
