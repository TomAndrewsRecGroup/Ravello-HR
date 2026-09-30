import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let session: { userId: string; email: string | null; role: string; companyId: string | null } | null;
let assessmentRow: { id: string; company_id: string } | null;
let capabilityAllowed: boolean;
let mintCalls: Array<{ entityType: string; entityId: string; actorUserId: string | null }>;
let revokeCalls: Array<{ entityType: string; entityId: string; actorUserId: string | null }>;

vi.mock('@/lib/auth/liveSession', () => ({
  requireLiveSession: () => Promise.resolve(session),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== 'coshh_assessments') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: assessmentRow, error: null }),
          }),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve({
    rpc: (name: string) => {
      if (name !== 'has_capability') throw new Error(`unexpected rpc ${name}`);
      return Promise.resolve({ data: capabilityAllowed, error: null });
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

const COSHH_ID = '11111111-1111-4111-8111-111111111111';
const req = () => new NextRequest(`https://portal.example.com/api/protect/coshh/${COSHH_ID}/qr`, { method: 'POST' });
const params = () => Promise.resolve({ id: COSHH_ID });

beforeEach(() => {
  session = { userId: 'user-1', email: 'a@b.com', role: 'client_admin', companyId: 'co-1' };
  assessmentRow = { id: COSHH_ID, company_id: 'co-1' };
  capabilityAllowed = true;
  mintCalls = [];
  revokeCalls = [];
});

describe('POST /api/protect/coshh/[id]/qr', () => {
  it('mints a label for the coshh_assessment entity type and returns the raw token URL', async () => {
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: 'raw-token-abc', url: 'https://portal.example.com/e/raw-token-abc' });
    expect(mintCalls).toEqual([{ entityType: 'coshh_assessment', entityId: COSHH_ID, actorUserId: 'user-1' }]);
  });

  it('checks risk.create against the ASSESSMENT\'s own organisation', async () => {
    assessmentRow = { id: COSHH_ID, company_id: 'co-DIFFERENT' };
    await POST(req(), { params: params() });
    expect(mintCalls).toHaveLength(1);
  });

  it('refuses with 401 when there is no live session', async () => {
    session = null;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(401);
    expect(mintCalls).toHaveLength(0);
  });

  it('refuses with 404 when the assessment does not exist', async () => {
    assessmentRow = null;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(404);
    expect(mintCalls).toHaveLength(0);
  });

  it('refuses with 403 when the caller lacks risk.create for the assessment\'s organisation', async () => {
    capabilityAllowed = false;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(403);
    expect(mintCalls).toHaveLength(0);
  });

  it('refuses a malformed id with 400 before touching the database', async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(res.status).toBe(400);
    expect(mintCalls).toHaveLength(0);
  });
});

describe('DELETE /api/protect/coshh/[id]/qr', () => {
  it('revokes the label under the same authorisation gate', async () => {
    const res = await DELETE(req(), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true });
    expect(revokeCalls).toEqual([{ entityType: 'coshh_assessment', entityId: COSHH_ID, actorUserId: 'user-1' }]);
  });

  it('refuses with 403 when the caller lacks risk.create', async () => {
    capabilityAllowed = false;
    const res = await DELETE(req(), { params: params() });
    expect(res.status).toBe(403);
    expect(revokeCalls).toHaveLength(0);
  });
});
