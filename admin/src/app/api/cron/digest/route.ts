import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { runDigest } from '@/lib/notify/digest';

// 07:00 UTC daily: one email per person whose preference is `daily`
// (staff by default), carrying every unread notification not yet
// emailed. See lib/notify/digest.ts.

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'digest', async (sb) => {
    const tally = await runDigest(sb);
    return { tally, degraded: tally.email_failures > 0 || tally.errors.length > 0 };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
