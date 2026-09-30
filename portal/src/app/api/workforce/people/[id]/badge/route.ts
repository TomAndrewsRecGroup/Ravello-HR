import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { requireLiveSession } from '@/lib/auth/liveSession';
import { mintWorkerQrToken, revokeWorkerQrToken, workerQrUrl } from '@/lib/workforce/qrTokens';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Core-OS 360 Phase 14, Group 2. worker_qr_tokens is RLS-on-no-policies
// (service role only, migration 179), so mint/revoke can never be a
// direct session insert the way most workforce writes in this app are
// — this route is the boundary. has_capability() is called under the
// CALLER'S OWN session (never the service role) so it evaluates the
// caller's REAL grant for the person's own organisation, staff
// included (is_tps_staff() already short-circuits it true) — the
// service-role client only performs the write itself, after that
// check has passed.
async function authorise(id: string) {
  if (!UUID_RE.test(id)) return { ok: false as const, status: 400, error: 'Invalid id' };

  const session = await requireLiveSession();
  if (!session) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const service = createServiceSupabaseClient();
  const { data: person } = await service.from('people').select('id, company_id').eq('id', id).maybeSingle();
  if (!person) return { ok: false as const, status: 404, error: 'Not found' };

  const supabase = await createServerSupabaseClient();
  const { data: allowed } = await supabase.rpc('has_capability', { p_org: person.company_id, p_cap: 'workforce.manage' });
  if (!allowed) return { ok: false as const, status: 403, error: 'Forbidden' };

  return { ok: true as const, service, userId: session.userId };
}

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await authorise(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await mintWorkerQrToken(auth.service, id, auth.userId);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 });

  return NextResponse.json({ token: res.token, url: workerQrUrl(res.token) });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await authorise(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await revokeWorkerQrToken(auth.service, id, auth.userId);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 });

  return NextResponse.json(res);
}
