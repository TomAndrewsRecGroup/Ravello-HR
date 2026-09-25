import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { processEvents } from '@/lib/events/process';
import { sweepSlaBreaches } from '@/lib/support/slaSweep';

// Every five minutes: drain platform_events through the rules.
// See lib/events/process.ts. Public in the middleware (/api/cron/),
// authorised by CRON_SECRET, switched off by AUTOMATION_DISABLED=1.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'process-events', async (sb) => {
    // Breached SLAs are emitted first so this same run acts on them.
    const sla = await sweepSlaBreaches(sb);
    const events = await processEvents(sb, { deadlineMs: 45_000 });
    const tally = { ...events, sla };
    return { tally, degraded: events.failed > 0 || events.email_failures > 0 || events.errors.length > 0 || !!sla.error };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
