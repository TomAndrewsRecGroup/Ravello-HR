import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { runReminders } from '@/lib/reminders/run';
import { processEvents } from '@/lib/events/process';

// 06:00 UTC daily: bucket every dated row, emit reminder events, write
// the overdue/expired statuses, then process what was emitted so the
// morning's notifications do not wait for the next five-minute tick.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'reminders', async (sb) => {
    const reminders = await runReminders(sb);
    const processed = await processEvents(sb, { deadlineMs: 30_000 });
    const tally = { reminders, processed };
    const degraded = reminders.errors.length > 0 || reminders.truncated.length > 0
      || processed.failed > 0 || processed.email_failures > 0 || processed.errors.length > 0;
    return { tally, degraded };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
