import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { loadEntityQrStatus } from '@/lib/entityQr/qrStatus';

// Public, token-authenticated entity QR badge scan (Core-OS 360
// Completion Programme, Phase 26, Group 4, migration 196) — a label on
// a machine or a COSHH cabinet is read by whoever is standing in front
// of it, who may have no portal login at all. The same security model
// as /api/w/[token]. Read-only: unlike a worker badge, there is no
// check-in/out concept for an object.

const getLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 60 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  if (!getLimiter.check(getRateLimitKey(request)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token } = await props.params;
  const service = createServiceSupabaseClient();
  const status = await loadEntityQrStatus(service, token);
  if (!status.ok) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  return NextResponse.json({ ok: true, entityType: status.entityType, fields: status.fields });
}
