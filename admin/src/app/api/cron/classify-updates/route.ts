import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { runClassifyUpdates } from '@/lib/latestUpdates/classify';

// Daily 06:30 UTC, ahead of reminders (06:00 is the H&S/HR reminder
// sweep — this is unrelated to it) and the 07:00 digest, so a same-day
// classification can ride the morning digest. Classifies up to 25
// unclassified published Latest Updates rows per run (BATCH_CAP in
// lib/latestUpdates/classify.ts) and tells staff only — see that file's
// header for why this never touches a client.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'classify-updates', async (sb) => {
    const tally = await runClassifyUpdates(sb);
    return { tally, degraded: tally.errors.length > 0 };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
