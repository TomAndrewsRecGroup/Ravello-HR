import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { processEvents } from '@/lib/events/process';

// Every five minutes: drain platform_events through the rules.
// See lib/events/process.ts. Public in the middleware (/api/cron/),
// authorised by CRON_SECRET, switched off by AUTOMATION_DISABLED=1.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'process-events', async (sb) => {
    const tally = await processEvents(sb, { deadlineMs: 45_000 });
    return { tally, degraded: tally.failed > 0 || tally.email_failures > 0 || tally.errors.length > 0 };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
