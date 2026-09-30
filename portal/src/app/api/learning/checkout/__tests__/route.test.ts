import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — E-Learning
// preservation test, slice 1: checkout session creation
// (docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md §3). The webhook side
// lives in the sibling ../../webhook/__tests__/route.test.ts.

let user: { id: string } | null;
let activeCompanyId: string | null;
let contentRow: { id: string; title: string; price_pence: number; stripe_price_id: string | null } | null;
let insertedPurchases: Array<Record<string, unknown>>;
let stripeResponse: { ok: boolean; body: unknown };
let fetchCalls: Array<{ url: string; body: string }>;

vi.mock('@/lib/rateLimit', () => ({
  createRateLimiter: () => ({ check: () => ({ allowed: true, remaining: 9, resetAt: 0 }) }),
  getRateLimitKey: () => 'k',
}));

vi.mock('@/lib/auth/activeOrganisation', () => ({
  effectiveCompanyId: () => Promise.resolve(activeCompanyId),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user } }) },
      from(table: string) {
        if (table === 'learning_content') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: contentRow, error: contentRow ? null : { message: 'not found' } }),
                }),
              }),
            }),
          };
        }
        if (table === 'learning_purchases') {
          return {
            insert: (payload: Record<string, unknown>) => {
              insertedPurchases.push(payload);
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    }),
}));

const { POST } = await import('../route');

const CONTENT_ID = '11111111-1111-4111-8111-111111111111';

function req(body: Record<string, unknown>) {
  return new NextRequest('https://portal.example.com/api/learning/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  user = { id: 'user-1' };
  activeCompanyId = 'co-1';
  contentRow = { id: CONTENT_ID, title: 'Leadership 101', price_pence: 4999, stripe_price_id: 'price_abc' };
  insertedPurchases = [];
  stripeResponse = { ok: true, body: { id: 'cs_test_123', url: 'https://checkout.stripe.com/cs_test_123' } };
  fetchCalls = [];
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.NEXT_PUBLIC_PORTAL_URL = 'https://portal.example.com';

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, opts: { body?: string }) => {
      fetchCalls.push({ url: String(url), body: String(opts?.body ?? '') });
      return Promise.resolve({
        ok: stripeResponse.ok,
        json: () => Promise.resolve(stripeResponse.body),
      } as Response);
    }),
  );
});

describe('POST /api/learning/checkout', () => {
  it('creates a Stripe Checkout session for published, priced content and returns its url', async () => {
    const res = await POST(req({ contentId: CONTENT_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ url: 'https://checkout.stripe.com/cs_test_123' });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.stripe.com/v1/checkout/sessions');
  });

  it('carries the content id, company id and user id in metadata on both the session and the payment intent', async () => {
    await POST(req({ contentId: CONTENT_ID }));
    const sent = new URLSearchParams(fetchCalls[0].body);
    expect(sent.get('metadata[content_id]')).toBe(CONTENT_ID);
    expect(sent.get('metadata[company_id]')).toBe('co-1');
    expect(sent.get('metadata[user_id]')).toBe('user-1');
    expect(sent.get('payment_intent_data[metadata][content_id]')).toBe(CONTENT_ID);
    expect(sent.get('payment_intent_data[metadata][company_id]')).toBe('co-1');
    expect(sent.get('line_items[0][price]')).toBe('price_abc');
  });

  it('records a pending purchase before returning the checkout url', async () => {
    await POST(req({ contentId: CONTENT_ID }));
    expect(insertedPurchases).toHaveLength(1);
    expect(insertedPurchases[0]).toMatchObject({
      content_id: CONTENT_ID,
      company_id: 'co-1',
      purchased_by: 'user-1',
      stripe_session_id: 'cs_test_123',
      amount_pence: 4999,
      status: 'pending',
    });
  });

  it('derives company id from the ACTIVE organisation, never a client-supplied one', async () => {
    await POST(req({ contentId: CONTENT_ID, companyId: 'attacker-supplied-co' } as Record<string, unknown>));
    expect(insertedPurchases[0].company_id).toBe('co-1');
  });

  it('refuses with 401 when there is no authenticated session', async () => {
    user = null;
    const res = await POST(req({ contentId: CONTENT_ID }));
    expect(res.status).toBe(401);
    expect(fetchCalls).toHaveLength(0);
    expect(insertedPurchases).toHaveLength(0);
  });

  it('refuses with 403 when the session has no resolvable active organisation', async () => {
    activeCompanyId = null;
    const res = await POST(req({ contentId: CONTENT_ID }));
    expect(res.status).toBe(403);
    expect(fetchCalls).toHaveLength(0);
  });

  it('refuses with 404 for content that does not exist or is not published', async () => {
    contentRow = null;
    const res = await POST(req({ contentId: CONTENT_ID }));
    expect(res.status).toBe(404);
    expect(fetchCalls).toHaveLength(0);
  });

  it('refuses free content — checkout is for paid content only', async () => {
    contentRow = { id: CONTENT_ID, title: 'Free intro', price_pence: 0, stripe_price_id: null };
    const res = await POST(req({ contentId: CONTENT_ID }));
    expect(res.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it('refuses a malformed contentId with 400 before reaching Stripe or the database', async () => {
    const res = await POST(req({ contentId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it('reports 502 and records no purchase when Stripe itself refuses the request', async () => {
    stripeResponse = { ok: false, body: { error: { message: 'bad price id' } } };
    const res = await POST(req({ contentId: CONTENT_ID }));
    expect(res.status).toBe(502);
    expect(insertedPurchases).toHaveLength(0);
  });
});
