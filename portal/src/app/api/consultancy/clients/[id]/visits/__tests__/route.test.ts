import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Phase 7, Group 2: booking a visit (optionally from a
// template). RLS (consultancy_visits_consultancy_write, 168) is the
// real authorization boundary; this route's own job is resolving
// previous_visit_id server-side and verifying a given template_id is
// actually the caller's own before trusting it.

let portfolio: { organisations: { organisation_id: string; name: string; organisation_type: string; role_key: string; access_scope: string }[] } | null;
let templateFound: boolean;
let priorVisit: { id: string } | null;
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
    from: (table: string) => {
      if (table === 'consultancy_visit_templates') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: templateFound ? { id: 'tmpl-1' } : null }) }) }) };
      }
      if (table === 'consultancy_visits') {
        return {
          select: () => ({
            eq: () => ({ in: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: priorVisit }) }) }) }) }),
          }),
          insert: (payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return { select: () => ({ single: () => Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: 'visit-1' }, error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { POST } = await import('../route');
const CLIENT_ID = '11111111-2222-4333-8444-555555555555';
const call = (body: Record<string, unknown>, id = CLIENT_ID) =>
  POST(new NextRequest(`https://portal.example.com/api/consultancy/clients/${id}/visits`, {
    method: 'POST', body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  templateFound = true;
  priorVisit = null;
  insertError = null;
  insertedPayload = null;
  portfolio = { organisations: [{ organisation_id: CLIENT_ID, name: 'ABC Manufacturing', organisation_type: 'direct_client', role_key: 'client_editor', access_scope: 'full' }] };
});

describe('POST /api/consultancy/clients/[id]/visits', () => {
  it('books a visit with previous_visit_id resolved server-side, status planned', async () => {
    priorVisit = { id: 'visit-old' };
    const res = await call({ visit_type: 'retained_visit', scheduled_date: '2026-11-01' });
    expect(res.status).toBe(200);
    expect(insertedPayload).toMatchObject({
      consultancy_organisation_id: 'co-laws', client_organisation_id: CLIENT_ID,
      status: 'planned', previous_visit_id: 'visit-old',
    });
  });

  it('a first-ever visit (no prior) gets previous_visit_id null, never fabricated', async () => {
    const res = await call({ visit_type: 'retained_visit', scheduled_date: '2026-11-01' });
    expect(res.status).toBe(200);
    expect(insertedPayload).toMatchObject({ previous_visit_id: null });
  });

  it('refuses a template_id that does not resolve under the caller\'s own RLS read', async () => {
    templateFound = false;
    const res = await call({ visit_type: 'retained_visit', scheduled_date: '2026-11-01', template_id: 'aaaaaaaa-2222-4333-8444-555555555555' });
    expect(res.status).toBe(404);
    expect(insertedPayload).toBeNull();
  });

  it('surfaces an RLS refusal (42501) as 403, not 500', async () => {
    insertError = { code: '42501', message: 'permission denied' };
    const res = await call({ visit_type: 'retained_visit', scheduled_date: '2026-11-01' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid visit_type before it reaches the database', async () => {
    const res = await call({ visit_type: 'not_a_real_type', scheduled_date: '2026-11-01' });
    expect(res.status).toBe(400);
    expect(insertedPayload).toBeNull();
  });

  it('404s for a client outside the caller\'s portfolio, 401s with no session', async () => {
    expect((await call({ visit_type: 'retained_visit', scheduled_date: '2026-11-01' }, '99999999-2222-4333-8444-555555555555')).status).toBe(404);
    portfolio = null;
    expect((await call({ visit_type: 'retained_visit', scheduled_date: '2026-11-01' })).status).toBe(401);
  });
});
