import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Shared shape for the automation crons (process-events, reminders,
// digest): the CRON_SECRET check, the service client, the kill switch,
// and one `automation_runs` row per invocation — refused ones
// included, because "the cron never ran" and "the cron ran and did
// nothing" must be distinguishable from the table alone (the referral
// cron was 307-redirected for weeks and nothing recorded it).

export type RunOutcome = 'ok' | 'degraded' | 'error' | 'disabled' | 'unauthorized';

export function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

export function automationDisabled(): boolean {
  return process.env.AUTOMATION_DISABLED === '1' || process.env.AUTOMATION_DISABLED === 'true';
}

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function recordRun(sb: SupabaseClient | null, row: {
  job: string; started_at: string; outcome: RunOutcome; tally?: unknown; error?: string | null;
}): Promise<void> {
  try {
    const client = sb ?? serviceClient();
    const { error } = await client.from('automation_runs').insert({
      job: row.job, started_at: row.started_at, finished_at: new Date().toISOString(),
      outcome: row.outcome, tally: row.tally ?? {}, error: row.error ?? null,
    });
    if (error) console.error('[automation] run row not written', error.message);
  } catch (err) {
    console.error('[automation] run row not written', (err as Error).message);
  }
}

/** Runs a job under the standard guards and records it. `body`
 *  returns the tally plus whether the run counts as degraded. */
export async function runCronJob(
  req: NextRequest,
  job: string,
  body: (sb: SupabaseClient) => Promise<{ tally: unknown; degraded: boolean; error?: string | null }>,
): Promise<NextResponse> {
  const started_at = new Date().toISOString();
  if (!authorizeCron(req)) {
    if (!process.env.CRON_SECRET) await recordRun(null, { job, started_at, outcome: 'unauthorized', error: 'CRON_SECRET is not set' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let sb: SupabaseClient;
  try { sb = serviceClient(); } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  if (automationDisabled()) {
    await recordRun(sb, { job, started_at, outcome: 'disabled' });
    return NextResponse.json({ job, outcome: 'disabled', ran_at: started_at });
  }
  try {
    const { tally, degraded, error } = await body(sb);
    const outcome: RunOutcome = error ? 'error' : degraded ? 'degraded' : 'ok';
    await recordRun(sb, { job, started_at, outcome, tally, error: error ?? null });
    console.log(JSON.stringify({ _audit: true, action: `cron.${job}.${outcome}`, ran_at: started_at, tally }));
    return NextResponse.json({ job, outcome, ran_at: started_at, tally, error: error ?? null }, { status: error ? 500 : 200 });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await recordRun(sb, { job, started_at, outcome: 'error', error: message });
    console.error(JSON.stringify({ _audit: true, action: `cron.${job}.error`, ran_at: started_at, error: message }));
    return NextResponse.json({ job, outcome: 'error', error: message }, { status: 500 });
  }
}
