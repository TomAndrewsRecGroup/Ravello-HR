import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { unsubscribe } from '@/lib/a2iRoles/match';

// Unsubscribe from the Athletes To Industry Thursday role email.
//
// POST is both the page's button and RFC 8058 one-click
// (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`, which mail
// clients send as a form body). The token in the URL is the only input,
// so the body is never read. A GET does nothing — link scanners must
// not be able to unsubscribe anyone.

const ipLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

export async function POST(request: NextRequest, props: Ctx) {
  const { token } = await props.params;
  if (!ipLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const res = await unsubscribe(createServiceSupabaseClient(), token);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, already: res.already });
}
