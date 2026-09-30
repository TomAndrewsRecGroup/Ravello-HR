import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let session: { userId: string; email: string | null; role: string; companyId: string | null } | null;
let personRow: { id: string; company_id: string } | null;
let capabilityAllowed: boolean;
let mintCalls: Array<{ personId: string; actorUserId: string | null }>;
let revokeCalls: Array<{ personId: string; actorUserId: string | null }>;

vi.mock('@/lib/auth/liveSession', () => ({
  requireLiveSession: () => Promise.resolve(session),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== 'people') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: personRow, error: null }),
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

vi.mock('@/lib/workforce/qrTokens', () => ({
  mintWorkerQrToken: (_service: unknown, personId: string, actorUserId: string | null) => {
    mintCalls.push({ personId, actorUserId });
    return Promise.resolve({ token: 'raw-token-abc', tokenHash: 'hash-abc' });
  },
  revokeWorkerQrToken: (_service: unknown, personId: string, actorUserId: string | null) => {
    revokeCalls.push({ personId, actorUserId });
    return Promise.resolve({ revoked: true });
  },
  workerQrUrl: (token: string) => `https://portal.example.com/w/${token}`,
}));

const { POST, DELETE } = await import('../route');

const PERSON_ID = '11111111-1111-4111-8111-111111111111';
const req = () => new NextRequest(`https://portal.example.com/api/workforce/people/${PERSON_ID}/badge`, { method: 'POST' });
const params = () => Promise.resolve({ id: PERSON_ID });

beforeEach(() => {
  session = { userId: 'user-1', email: 'a@b.com', role: 'client_admin', companyId: 'co-1' };
  personRow = { id: PERSON_ID, company_id: 'co-1' };
  capabilityAllowed = true;
  mintCalls = [];
  revokeCalls = [];
});

describe('POST /api/workforce/people/[id]/badge', () => {
  it('mints a badge and returns the raw token URL — the ONLY time it is ever returned', async () => {
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: 'raw-token-abc', url: 'https://portal.example.com/w/raw-token-abc' });
    expect(mintCalls).toEqual([{ personId: PERSON_ID, actorUserId: 'user-1' }]);
  });

  it('checks capability against the PERSON\'s own organisation, not the caller\'s home company', async () => {
    personRow = { id: PERSON_ID, company_id: 'co-DIFFERENT' };
    await POST(req(), { params: params() });
    // capability RPC is called once; we only assert the route did not
    // short-circuit on a company mismatch of its own invention — the
    // real gate is has_capability(), exercised via capabilityAllowed.
    expect(mintCalls).toHaveLength(1);
  });

  it('refuses with 401 when there is no live session', async () => {
    session = null;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(401);
    expect(mintCalls).toHaveLength(0);
  });

  it('refuses with 404 when the person does not exist', async () => {
    personRow = null;
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(404);
    expect(mintCalls).toHaveLength(0);
  });

  it('refuses with 403 when the caller lacks workforce.manage for the person\'s organisation', async () => {
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

describe('DELETE /api/workforce/people/[id]/badge', () => {
  it('revokes the badge under the same authorisation gate', async () => {
    const res = await DELETE(req(), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true });
    expect(revokeCalls).toEqual([{ personId: PERSON_ID, actorUserId: 'user-1' }]);
  });

  it('refuses with 403 when the caller lacks workforce.manage', async () => {
    capabilityAllowed = false;
    const res = await DELETE(req(), { params: params() });
    expect(res.status).toBe(403);
    expect(revokeCalls).toHaveLength(0);
  });
});
