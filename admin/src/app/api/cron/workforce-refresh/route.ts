import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';

// Hourly: the Safe to Deploy cache (migration 136/137).
//
//   1. workforce_daily_tick() — the dates that pass with no write:
//      planned assignments start, lifecycles move (pre_employment →
//      active on the start date, active → notice once an end date is
//      set). Idempotent, so running it hourly is harmless.
//   2. workforce_refresh_due() — recalculates every cached status that
//      an input change marked dirty, that reached its valid_until date,
//      or that has never been calculated, and logs each transition to
//      deployment_status_log (which the outbox turns into a
//      notification).
//
// Nothing READS from this job's output to decide anything: every public
// read calculates live when the cache is dirty or out of date, so a
// missed run makes pages slower, never wrong.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Measured 2026-09-28 (probes/phase3_perf.sql): ~3.3 ms a person, so 5,000
// (the function's own cap) is ~17 s — inside maxDuration with room.
const BATCH = 5000;

async function run(req: NextRequest) {
  return runCronJob(req, 'workforce-refresh', async (sb) => {
    const tick = await sb.rpc('workforce_daily_tick');
    if (tick.error) return { tally: { stage: 'tick' }, degraded: true, error: tick.error.message };
    const refreshed = await sb.rpc('workforce_refresh_due', { p_limit: BATCH });
    if (refreshed.error) return { tally: { tick: tick.data }, degraded: true, error: refreshed.error.message };
    const n = Number(refreshed.data ?? 0);
    // A full batch means more are waiting; the next run takes them.
    return { tally: { tick: tick.data, refreshed: n, backlog: n >= BATCH }, degraded: false };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
