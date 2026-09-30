import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { loadWorkerQrStatus } from '@/lib/workforce/qrStatus';

const postLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  if (!postLimiter.check(getRateLimitKey(request)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token } = await props.params;
  const service = createServiceSupabaseClient();
  const status = await loadWorkerQrStatus(service, token);
  if (!status.ok) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const { error, count } = await service.from('site_checkins')
    .update({ checked_out_at: new Date().toISOString() }, { count: 'exact' })
    .eq('person_id', status.personId).is('checked_out_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, changed: (count ?? 0) > 0 });
}
