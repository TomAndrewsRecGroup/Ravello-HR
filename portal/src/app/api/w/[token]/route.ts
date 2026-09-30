import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { loadWorkerQrStatus } from '@/lib/workforce/qrStatus';

// Public, token-authenticated worker QR badge scan (Core-OS 360 Phase
// 14, 179) — whoever scans a badge may have no portal login at all,
// the same security model as /api/leave/[token], /api/policy/[token]
// and /api/test/[token]. Never person_id/site_id to the browser — the
// checkin/checkout routes re-resolve the token themselves.

const getLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 60 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  if (!getLimiter.check(getRateLimitKey(request)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token } = await props.params;
  const service = createServiceSupabaseClient();
  const status = await loadWorkerQrStatus(service, token);
  if (!status.ok) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    fullName: status.fullName,
    jobTitle: status.jobTitle,
    companyName: status.companyName,
    siteName: status.siteName,
    status: status.status,
    checkedIn: status.checkedIn,
  });
}
