import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { runRoleAlert } from '@/lib/a2iRoles/send';

// Thursday 15:00 UK: the Athletes To Industry "live roles" email
// (lib/a2iRoles/send.ts). vercel.json fires this every 5 minutes from
// 14:00 to 17:55 UTC on Thursdays, because 15:00 in London is 14:00 UTC
// in summer and 15:00 UTC in winter; runRoleAlert itself decides whether
// it is time. The send is spread over an hour and each tick sends only
// the emails now due, so they go out one or two at a time until 16:00.
//
// A retryable failure (Manatal down, SMTP refusing) is reported as
// `degraded`, never as an error: a 500 here would page someone on every
// retry. Tom gets one email of his own if it is still failing
// at 17:30 UK.

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'a2i-role-alert', async (sb) => {
    const r = await runRoleAlert(sb, { now: new Date(), trigger: 'cron' });
    return { tally: { ...r.tally, error: r.error ?? r.tally.error ?? null }, degraded: r.degraded || Boolean(r.error) };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
