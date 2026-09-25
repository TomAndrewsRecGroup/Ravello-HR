import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { runWeeklySummary } from '@/lib/hs/weeklySummary';

// Monday 07:00 UTC: the provider weekly digest and the client weekly
// safety summary. See lib/hs/weeklySummary.ts.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'weekly-summary', async (sb) => {
    const tally = await runWeeklySummary(sb);
    return { tally, degraded: tally.email_failures > 0 || tally.errors.length > 0 };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
