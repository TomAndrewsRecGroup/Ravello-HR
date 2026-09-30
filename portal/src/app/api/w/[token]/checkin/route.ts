import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { loadWorkerQrStatus } from '@/lib/workforce/qrStatus';

// Checks the badge's own person in at their own assigned site
// (people.site_id) — v1 has no manual site picker, flagged as debt in
// the plan doc. Idempotent: a repeated scan while already checked in
// is reported, not a second open row (the DB's own partial unique
// index — site_checkins_one_open_per_person, 179 — is the real guard;
// the 23505 branch here only avoids surfacing it as an error).

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

  if (status.checkedIn) return NextResponse.json({ ok: true, alreadyCheckedIn: true });

  const { error } = await service.from('site_checkins').insert({ person_id: status.personId, site_id: status.siteId });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true, alreadyCheckedIn: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
