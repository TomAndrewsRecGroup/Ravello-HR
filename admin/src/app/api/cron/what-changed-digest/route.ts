import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { runWhatChangedDigest } from '@/lib/whatChanged/digest';

// Core-OS 360 Completion Programme, Phase 25, Group 5 (C9.5). 07:10
// UTC daily — see lib/whatChanged/digest.ts's own header for why one
// cron carries both the daily and weekly modes.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'what-changed-digest', async (sb) => {
    const tally = await runWhatChangedDigest(sb);
    return { tally, degraded: tally.email_failures > 0 || tally.errors.length > 0 };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
