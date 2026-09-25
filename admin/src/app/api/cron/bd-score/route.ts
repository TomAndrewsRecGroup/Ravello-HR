import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { runBdScore } from '@/lib/bd/score';

// Sunday 06:00 UTC: score every BD prospect and queue the week's calls
// (lib/bd/score.ts). Public in the middleware (/api/cron/), authorised
// by CRON_SECRET, switched off by AUTOMATION_DISABLED=1.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'bd-score', async (sb) => {
    const tally = await runBdScore(sb);
    return { tally, degraded: tally.errors.length > 0 };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
