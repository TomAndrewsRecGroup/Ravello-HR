import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Resend emits an event for the consumer to email a fresh link. The
// company comes from the LIVE session and must match the row; only an
// open row, only an admin.

let session: { userId: string; role: string; companyId: string | null } | null;
let ack: Record<string, unknown> | null;
const emitted: any[] = [];
vi.mock('@/lib/auth/liveSession', () => ({ requireLiveSession: () => Promise.resolve(session) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: ack }) }) }) }) }) }));
vi.mock('@/lib/events/emit', () => ({ emitEvent: async (_sb: unknown, input: unknown) => { emitted.push(input); return { error: null }; } }));
vi.mock('@/lib/rateLimit', () => ({ limiters: { email: { check: () => ({ allowed: true, resetAt: 0 }) } }, getUserRateLimitKey: () => 'k', rateLimitResponse: () => new Response('rate limited', { status: 429 }) }));

const { POST } = await import('../route');
const ID = '11111111-2222-4333-8444-555555555555';
const call = (id = ID) => POST(new NextRequest(`https://portal.example.com/api/portal/policy-acks/${id}/resend`, { method: 'POST' }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  emitted.length = 0;
  session = { userId: 'u-1', role: 'client_admin', companyId: 'co-1' };
  ack = { id: ID, company_id: 'co-1', status: 'overdue', employee_id: 'emp-1', document_id: 'doc-1' };
});

describe('POST /api/portal/policy-acks/[id]/resend', () => {
  it('emits a policy_ack_resend event carrying the row and the caller', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(emitted).toEqual([{ companyId: 'co-1', entityType: 'policy_ack_resend', entityId: ID, eventType: 'created', actorId: 'u-1', actorKind: 'client', payload: { employee_id: 'emp-1', document_id: 'doc-1' } }]);
  });
  it('refuses another company\'s row, a signed row, a viewer and a signed-out caller', async () => {
    ack = { ...ack!, company_id: 'co-2' };
    expect((await call()).status).toBe(404);
    ack = { ...ack!, company_id: 'co-1', status: 'acknowledged' };
    expect((await call()).status).toBe(409);
    ack = { ...ack!, status: 'pending' };
    session = { userId: 'u-1', role: 'client_user', companyId: 'co-1' };
    expect((await call()).status).toBe(403);
    session = null;
    expect((await call()).status).toBe(401);
    expect(emitted).toHaveLength(0);
    expect((await call('nope')).status).toBe(401);
  });
});
