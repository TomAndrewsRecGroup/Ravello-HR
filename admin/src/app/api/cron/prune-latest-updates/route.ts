import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const DEFAULT_MAX_AGE_DAYS = 365;

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function run(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const days = Number(req.nextUrl.searchParams.get('days') ?? DEFAULT_MAX_AGE_DAYS);
  if (!Number.isFinite(days) || days < 30) {
    return NextResponse.json({ error: 'days must be >= 30' }, { status: 400 });
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc('prune_latest_updates', { p_max_age_days: days });

  if (error) {
    // Loud structured log so the failed prune is visible in any
    // log drain even though Vercel cron itself only sees the HTTP
    // status. Auditing the success case as well so operators can
    // see the deleted-count history without tailing function logs.
    console.error(JSON.stringify({
      _audit:   true,
      action:   'cron.prune.failed',
      cutoff_days: days,
      error:    error.message,
      ran_at:   new Date().toISOString(),
    }));
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(JSON.stringify({
    _audit:    true,
    action:    'cron.prune.ok',
    cutoff_days: days,
    deleted:   data ?? 0,
    ran_at:    new Date().toISOString(),
  }));

  return NextResponse.json({
    ran_at:      new Date().toISOString(),
    cutoff_days: days,
    deleted:     data ?? 0,
  });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
