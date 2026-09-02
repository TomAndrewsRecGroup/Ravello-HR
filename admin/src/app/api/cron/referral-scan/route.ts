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
import { DEFAULT_BATCH_CAP } from '@/lib/referral/pipeline';
import { runReferralScan } from '@/lib/referral/runScan';

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

  const capParam = Number(req.nextUrl.searchParams.get('cap') ?? DEFAULT_BATCH_CAP);

  let supabase;
  try {
    supabase = serviceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // The scan itself lives in lib/referral/runScan so the operator's
  // "Run scan now" button and this cron cannot diverge.
  const { payload, unhealthy, error } = await runReferralScan(supabase, { cap: capParam });

  if (error) {
    console.error(JSON.stringify({
      _audit: true, action: 'cron.referral.failed', error, ran_at: payload.ran_at,
    }));
    await recordRun(supabase, {
      ok: false, outcome: 'error', duration_ms: Date.now() - startedAt,
      notes: [`Could not read referral_role_config: ${error}`],
    });
    return NextResponse.json({ error }, { status: 500 });
  }

  console.log(JSON.stringify({
    _audit: true,
    action: unhealthy ? 'cron.referral.degraded' : 'cron.referral.ok',
    ...payload,
  }));

  await recordRun(supabase, {
    ok: !unhealthy,
    outcome: unhealthy ? 'degraded' : (payload.roles_considered === 0 ? 'no_roles' : 'ok'),
    duration_ms:      Date.now() - startedAt,
    roles_considered: payload.roles_considered,
    roles_skipped:    payload.roles_skipped,
    matches_seen:     payload.matches_seen,
    scanned:          payload.scanned,
    emailed:          (payload as any).emailed ?? 0,
    tally:            payload,
    notes:            payload.notes,
  });

  return NextResponse.json(payload, { status: unhealthy ? 500 : 200 });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
