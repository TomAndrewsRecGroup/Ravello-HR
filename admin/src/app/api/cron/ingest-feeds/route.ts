import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ingestFeed } from '@/lib/rss/ingestFeed';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

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

  const supabase = serviceClient();
  const { data: sources, error } = await supabase
    .from('feed_sources')
    .select('id, slug, display_name, feed_url, source_type, category, active, scrape_config')
    .eq('active', true)
    .in('source_type', ['rss', 'html']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const s of sources ?? []) {
    results.push(await ingestFeed(supabase, s));
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.fetched += r.fetched;
      acc.inserted += r.inserted;
      acc.skipped += r.skipped;
      if (r.error) acc.errors += 1;
      return acc;
    },
    { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
  );

  // Surface failure to Vercel cron monitoring: if every source threw
  // (or > 50% of them did), return a non-2xx so Vercel shows the run
  // as failed and we can alarm. 200 every time meant a fully-broken
  // ingest stayed silent until someone noticed Latest Updates was
  // stale on the marketing site.
  const failureRatio = results.length > 0 ? totals.errors / results.length : 0;
  const status = (results.length > 0 && failureRatio >= 0.5) ? 502 : 200;

  return NextResponse.json({
    sources: results.length,
    totals,
    results,
    ran_at: new Date().toISOString(),
    status: status === 200 ? 'ok' : 'degraded',
  }, { status });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
