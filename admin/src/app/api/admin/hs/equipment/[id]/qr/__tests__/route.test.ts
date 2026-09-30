import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let staffOk: boolean;
let assetRow: { id: string } | null;
let mintCalls: Array<{ entityType: string; entityId: string; actorUserId: string | null }>;
let revokeCalls: Array<{ entityType: string; entityId: string; actorUserId: string | null }>;

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () => Promise.resolve(staffOk
    ? { ok: true, role: 'tps_admin', userId: 'staff-1' }
    : { ok: false, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) }),
}));

vi.mock('@/lib/automation/runs', () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table !== 'hs_equipment') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: assetRow, error: null }),
          }),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/entityQr/qrTokens', () => ({
  mintEntityQrToken: (_service: unknown, entityType: string, entityId: string, actorUserId: string | null) => {
    mintCalls.push({ entityType, entityId, actorUserId });
    return Promise.resolve({ token: 'raw-token-abc', tokenHash: 'hash-abc' });
  },
  revokeEntityQrToken: (_service: unknown, entityType: string, entityId: string, actorUserId: string | null) => {
    revokeCalls.push({ entityType, entityId, actorUserId });
    return Promise.resolve({ revoked: true });
  },
  entityQrUrl: (token: string) => `https://portal.example.com/e/${token}`,
}));

const { POST, DELETE } = await import('../route');

const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const req = () => new NextRequest(`https://admin.example.com/api/admin/hs/equipment/${ASSET_ID}/qr`, { method: 'POST' });
const params = () => Promise.resolve({ id: ASSET_ID });

beforeEach(() => {
  staffOk = true;
  assetRow = { id: ASSET_ID };
  mintCalls = [];
  revokeCalls = [];
});

describe('POST /api/admin/hs/equipment/[id]/qr', () => {
  it('mints a label for the equipment entity type and returns the raw token URL', async () => {
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: 'raw-token-abc', url: 'https://portal.example.com/e/raw-token-abc' });
    expect(mintCalls).toEqual([{ entityType: 'equipment', entityId: ASSET_ID, actorUserId: 'staff-1' }]);
  });

  it('refuses with 401 when the caller is not staff', async () => {
    staffOk = false;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(401);
    expect(mintCalls).toHaveLength(0);
  });

  it('refuses with 404 when the asset does not exist', async () => {
    assetRow = null;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(404);
    expect(mintCalls).toHaveLength(0);
  });

  it('refuses a malformed id with 400 before touching the database', async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(res.status).toBe(400);
    expect(mintCalls).toHaveLength(0);
  });
});

describe('DELETE /api/admin/hs/equipment/[id]/qr', () => {
  it('revokes the label under the same authorisation gate', async () => {
    const res = await DELETE(req(), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true });
    expect(revokeCalls).toEqual([{ entityType: 'equipment', entityId: ASSET_ID, actorUserId: 'staff-1' }]);
  });

  it('refuses with 401 when the caller is not staff', async () => {
    staffOk = false;
    const res = await DELETE(req(), { params: params() });
    expect(res.status).toBe(401);
    expect(revokeCalls).toHaveLength(0);
  });
});
