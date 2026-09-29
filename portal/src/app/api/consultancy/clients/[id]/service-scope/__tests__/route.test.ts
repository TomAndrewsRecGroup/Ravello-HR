import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Phase 6, Group 7: the write path for the Service Scope
// model (section 5) — RLS (168's consultancy_service_scopes_consultancy_
// write policy) is the real authorization boundary, so this route's own
// job is only shaping/validating the request and surfacing a refused
// write clearly; the fake here returns a 42501 to prove that path.

let portfolio: { organisations: { organisation_id: string; name: string; organisation_type: string; role_key: string; access_scope: string }[] } | null;
let insertError: { code: string; message: string } | null;
let insertedPayload: Record<string, unknown> | null;

vi.mock('@/lib/consultancy/portfolioAccess', () => ({
  requirePortfolioSession: () => Promise.resolve(portfolio),
  portfolioIncludes: (orgs: { organisation_id: string }[], id: string) => orgs.some(o => o.organisation_id === id),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve({
    rpc: (name: string) => {
      if (name === 'my_home_company_id') return Promise.resolve({ data: 'co-laws', error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        insertedPayload = payload;
        return {
          select: () => ({
            single: () => Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: 'scope-1' }, error: null }),
          }),
        };
      },
    }),
  }),
}));

const { POST } = await import('../route');
const CLIENT_ID = '11111111-2222-4333-8444-555555555555';
const call = (body: Record<string, unknown>, id = CLIENT_ID) =>
  POST(new NextRequest(`https://portal.example.com/api/consultancy/clients/${id}/service-scope`, {
    method: 'POST', body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  insertError = null;
  insertedPayload = null;
  portfolio = { organisations: [{ organisation_id: CLIENT_ID, name: 'ABC Manufacturing', organisation_type: 'direct_client', role_key: 'client_editor', access_scope: 'full' }] };
});

describe('POST /api/consultancy/clients/[id]/service-scope', () => {
  it('inserts a scope scoped to the caller\'s home organisation and the route\'s own client id', async () => {
    const res = await call({ service_type: 'retained_hs_consultancy', start_date: '2026-01-01' });
    expect(res.status).toBe(200);
    expect(insertedPayload).toMatchObject({
      consultancy_organisation_id: 'co-laws',
      client_organisation_id: CLIENT_ID,
      service_type: 'retained_hs_consultancy',
      start_date: '2026-01-01',
    });
  });

  it('refuses an invalid service_type before it ever reaches the database', async () => {
    const res = await call({ service_type: 'not_a_real_type', start_date: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(insertedPayload).toBeNull();
  });

  it('surfaces an RLS refusal (42501) as 403, not 500', async () => {
    insertError = { code: '42501', message: 'permission denied' };
    const res = await call({ service_type: 'retained_hs_consultancy', start_date: '2026-01-01' });
    expect(res.status).toBe(403);
  });

  it('404s for a client outside the caller\'s portfolio, 401s with no session', async () => {
    expect((await call({ service_type: 'retained_hs_consultancy', start_date: '2026-01-01' }, '99999999-2222-4333-8444-555555555555')).status).toBe(404);
    portfolio = null;
    expect((await call({ service_type: 'retained_hs_consultancy', start_date: '2026-01-01' })).status).toBe(401);
  });
});
