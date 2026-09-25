import { NextRequest } from 'next/server';
import { runCronJob } from '@/lib/automation/runs';
import { runWeeklySummary } from '@/lib/hs/weeklySummary';
import { runWeeklyPeople } from '@/lib/lead/weeklyPeople';

// Monday 07:00 UTC: the provider weekly digest, the client weekly safety
// summary (lib/hs/weeklySummary.ts) and the people insights — absence
// patterns and onboarding risk (lib/lead/weeklyPeople.ts).

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  return runCronJob(req, 'weekly-summary', async (sb) => {
    const hs = await runWeeklySummary(sb);
    const people = await runWeeklyPeople(sb);
    const tally = { ...hs, people };
    return { tally, degraded: hs.email_failures > 0 || hs.errors.length > 0 || people.errors.length > 0 };
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
