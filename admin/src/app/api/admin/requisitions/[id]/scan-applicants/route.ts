// POST /api/admin/requisitions/[id]/scan-applicants
//
// Run the referral scan for ONE role, now, from the admin app.
//
// It exists because the hourly cron does not. Vercel's Cron Jobs tab
// for this project is empty, so `admin/vercel.json` has never been read
// and none of its four schedules have ever fired — which is also why
// `latest_updates` has zero rows. A pipeline whose only trigger is a
// schedule that does not exist cannot be run at all.
//
// It stays useful after the schedule is fixed: re-scanning after a
// criteria change is a thing an operator wants to do without waiting
// for the top of the hour.
//
// SAME implementation as the cron (`runReferralScan`). A second copy of
// the gating loop is the copy nobody re-checks, and every decision it
// makes is about whether to email a stranger.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth/requireStaff';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { runReferralScan } from '@/lib/referral/runScan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(httpReq: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // Metered: every scanned applicant spends IvyLens credit and a
  // Manatal call. A button anyone can hold down needs a ceiling.
  const rl = limiters.vendor.check(getUserRateLimitKey(httpReq, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase service credentials are not configured.' }, { status: 500 });
  }
  // Service role, like the cron: the pipeline writes referral_applications
  // rows for candidates across companies and must not be narrowed by the
  // operator's own RLS scope.
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const startedAt = Date.now();
  const { payload, unhealthy, error } = await runReferralScan(supabase, {
    // Scoped to THIS role, so re-running one does not consume the batch
    // cap on somebody else's applicants.
    requisitionId: params.id,
  });

  // Recorded like a scheduled run, so the funnel's history shows every
  // scan whatever triggered it. `outcome` names the trigger, because a
  // manual run and a 09:00 tick are different facts.
  await supabase.from('referral_scan_runs').insert({
    ok: !unhealthy && !error,
    outcome: error ? 'error' : unhealthy ? 'degraded' : 'manual',
    duration_ms:      Date.now() - startedAt,
    roles_considered: payload.roles_considered,
    roles_skipped:    payload.roles_skipped,
    matches_seen:     payload.matches_seen,
    scanned:          payload.scanned,
    emailed:          (payload as { emailed?: number }).emailed ?? 0,
    tally:            payload,
    notes:            error ? [error, ...payload.notes] : payload.notes,
  }).then(undefined, () => { /* best-effort, like the cron's */ });

  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ ok: !unhealthy, ...payload });
}
