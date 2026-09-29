import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Phase 6, Group 7: the manual half of the Service Ledger
// (section 9's "authorised manual service entries"). RLS (169's
// consultancy_service_ledger_consultancy_manual_insert) forces
// entry_type/source_type/source_id/created_by itself; this route
// fires the app-level service_ledger.entry_created audit event that
// has no DB row-trigger equivalent (migration 172's own header
// comment explains why).

let portfolio: { organisations: { organisation_id: string; name: string; organisation_type: string; role_key: string; access_scope: string }[] } | null;
let insertError: { code: string; message: string } | null;
let insertedPayload: Record<string, unknown> | null;
const auditCalls: any[] = [];

vi.mock('@/lib/consultancy/portfolioAccess', () => ({
  requirePortfolioSession: () => Promise.resolve(portfolio),
  portfolioIncludes: (orgs: { organisation_id: string }[], id: string) => orgs.some(o => o.organisation_id === id),
}));

vi.mock('@/lib/audit', () => ({ auditLog: (entry: unknown) => { auditCalls.push(entry); } }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve({
    rpc: (name: string) => {
      if (name === 'my_home_company_id') return Promise.resolve({ data: 'co-laws', error: null });
      return Promise.resolve({ data: null, error: null });
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'consultant-1' } } }) },
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        insertedPayload = payload;
        return {
          select: () => ({
            single: () => Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: 'entry-1' }, error: null }),
          }),
        };
      },
    }),
  }),
}));

const { POST } = await import('../route');
const CLIENT_ID = '11111111-2222-4333-8444-555555555555';
const call = (body: Record<string, unknown>, id = CLIENT_ID) =>
  POST(new NextRequest(`https://portal.example.com/api/consultancy/clients/${id}/ledger-entry`, {
    method: 'POST', body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  insertError = null;
  insertedPayload = null;
  auditCalls.length = 0;
  portfolio = { organisations: [{ organisation_id: CLIENT_ID, name: 'ABC Manufacturing', organisation_type: 'direct_client', role_key: 'client_editor', access_scope: 'full' }] };
});

describe('POST /api/consultancy/clients/[id]/ledger-entry', () => {
  it('inserts a manual entry keyed to the home/client organisations and fires service_ledger.entry_created', async () => {
    const res = await call({ summary: 'Called the client to talk through the audit findings.' });
    expect(res.status).toBe(200);
    expect(insertedPayload).toMatchObject({
      consultancy_organisation_id: 'co-laws',
      client_organisation_id: CLIENT_ID,
      entry_type: 'manual',
      created_by: 'consultant-1',
    });
    expect(auditCalls).toEqual([expect.objectContaining({
      action: 'service_ledger.entry_created',
      actor_id: 'consultant-1',
      organisation_id: CLIENT_ID,
    })]);
  });

  it('never fires the audit event when the write is refused', async () => {
    insertError = { code: '42501', message: 'permission denied' };
    const res = await call({ summary: 'Should be refused.' });
    expect(res.status).toBe(403);
    expect(auditCalls).toHaveLength(0);
  });

  it('rejects an empty summary before it reaches the database', async () => {
    const res = await call({ summary: '' });
    expect(res.status).toBe(400);
    expect(insertedPayload).toBeNull();
  });

  it('404s for a client outside the caller\'s portfolio, 401s with no session', async () => {
    expect((await call({ summary: 'x' }, '99999999-2222-4333-8444-555555555555')).status).toBe(404);
    portfolio = null;
    expect((await call({ summary: 'x' })).status).toBe(401);
  });
});
