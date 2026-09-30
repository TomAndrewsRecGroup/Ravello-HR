import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { serviceClient } from '@/lib/automation/runs';
import { mintEntityQrToken, revokeEntityQrToken, entityQrUrl } from '@/lib/entityQr/qrTokens';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Core-OS 360 Completion Programme, Phase 26, Group 4 (C14.9).
// entity_qr_tokens is RLS-on-no-policies (service role only, 196), so
// mint/revoke can never be a direct session insert. The whole
// /health-safety section is already staff-only by the admin app's own
// auth layer — no per-org capability check is needed beyond
// requireStaff(), the same posture every other write on this page
// (EquipmentClient.tsx) already has.
async function authorise(id: string) {
  if (!UUID_RE.test(id)) return { ok: false as const, status: 400, error: 'Invalid id' };

  const auth = await requireStaff();
  if (!auth.ok) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const service = serviceClient();
  const { data: asset } = await service.from('hs_equipment').select('id').eq('id', id).maybeSingle();
  if (!asset) return { ok: false as const, status: 404, error: 'Not found' };

  return { ok: true as const, service, userId: auth.userId };
}

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await authorise(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await mintEntityQrToken(auth.service, 'equipment', id, auth.userId);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 });

  return NextResponse.json({ token: res.token, url: entityQrUrl(res.token) });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await authorise(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await revokeEntityQrToken(auth.service, 'equipment', id, auth.userId);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 });

  return NextResponse.json(res);
}
