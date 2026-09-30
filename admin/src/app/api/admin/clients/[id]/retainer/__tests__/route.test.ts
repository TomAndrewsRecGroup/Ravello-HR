import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — Billing/
// Invoicing preservation test, slice 1: retainer setup
// (docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md §4).

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

let company: Record<string, unknown> | null;
let updatedCompanies: Array<{ id: string; patch: Record<string, unknown> }>;
let staffOk: boolean;
let stripeIsConfigured: boolean;
let createCustomerCalls: unknown[];
let createPriceCalls: unknown[];
let createSubscriptionCalls: unknown[];
let updateSubscriptionPriceCalls: unknown[];
let throwOnStripeCall: string | null;
let auditCalls: unknown[];
let sentEmails: unknown[];
let revalidateCalls: string[];

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () =>
    Promise.resolve(
      staffOk ? { ok: true, userId: 'staff-1' } : { ok: false, response: new Response('no', { status: 403 }) },
    ),
}));

vi.mock('@/lib/rateLimit', () => ({
  limiters: { vendor: { check: () => ({ allowed: true, resetAt: 0 }) } },
  getUserRateLimitKey: () => 'k',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

vi.mock('@/lib/audit', () => ({ auditLog: (e: unknown) => { auditCalls.push(e); } }));

vi.mock('@/app/actions', () => ({ revalidateClientDetail: (id: string) => { revalidateCalls.push(id); return Promise.resolve(); } }));

vi.mock('@/lib/email', () => ({
  sendEmail: (m: unknown) => { sentEmails.push(m); return Promise.resolve({ id: 'email-1', delivered: true }); },
  billingSetupEmail: (input: Record<string, unknown>) => ({ to: input.to, subject: 'Billing activated', ...input }),
}));

vi.mock('@/lib/portalUrl', () => ({ portalUrl: () => 'https://portal.example.com' }));

vi.mock('@/lib/stripe', () => ({
  stripeConfigured: () => stripeIsConfigured,
  createCustomer: (args: unknown) => {
    createCustomerCalls.push(args);
    if (throwOnStripeCall === 'createCustomer') throw new Error('stripe customer create failed');
    return Promise.resolve('cus_new_1');
  },
  createPrice: (args: unknown) => {
    createPriceCalls.push(args);
    if (throwOnStripeCall === 'createPrice') throw new Error('stripe price create failed');
    return Promise.resolve('price_new_1');
  },
  createSubscription: (args: unknown) => {
    createSubscriptionCalls.push(args);
    if (throwOnStripeCall === 'createSubscription') throw new Error('stripe subscription create failed');
    return Promise.resolve({ subscriptionId: 'sub_new_1', status: 'active', currentPeriodStart: 1_700_000_000 });
  },
  updateSubscriptionPrice: (args: unknown) => {
    updateSubscriptionPriceCalls.push(args);
    if (throwOnStripeCall === 'updateSubscriptionPrice') throw new Error('stripe price swap failed');
    return Promise.resolve();
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      from(table: string) {
        if (table !== 'companies') throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              // A REAL select().single() deserialises a fresh row —
              // it is never a live reference to whatever the DB holds
              // a moment later. Returning a copy here (not `company`
              // itself) is what makes the later update()-mutates-
              // company sequence in this fake behave like the real
              // client, rather than retroactively mutating a value
              // the route already captured in its own local const.
              single: () => Promise.resolve(company ? { data: { ...company }, error: null } : { data: null, error: { message: 'not found' } }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              updatedCompanies.push({ id, patch });
              if (company && company.id === id) Object.assign(company, patch);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      },
    }),
}));

const { PATCH } = await import('../route');

function req(body: Record<string, unknown>) {
  return new NextRequest(`https://admin.example.com/api/admin/clients/${COMPANY_ID}/retainer`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
const params = () => Promise.resolve({ id: COMPANY_ID });

beforeEach(() => {
  staffOk = true;
  stripeIsConfigured = true;
  throwOnStripeCall = null;
  company = {
    id: COMPANY_ID,
    name: 'Acme Ltd',
    contact_email: 'billing@acme.example.com',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    monthly_retainer_pence: null,
  };
  updatedCompanies = [];
  createCustomerCalls = [];
  createPriceCalls = [];
  createSubscriptionCalls = [];
  updateSubscriptionPriceCalls = [];
  auditCalls = [];
  sentEmails = [];
  revalidateCalls = [];
});

describe('PATCH /api/admin/clients/[id]/retainer — first-time setup', () => {
  it('creates a customer, price and subscription, persists the ids, and emails the client', async () => {
    const res = await PATCH(req({ monthly_retainer_pence: 50000 }), { params: params() });
    expect(res.status).toBe(200);
    expect(createCustomerCalls).toHaveLength(1);
    expect(createPriceCalls).toEqual([{ unitAmountPence: 50000 }]);
    expect(createSubscriptionCalls).toHaveLength(1);
    expect(company).toMatchObject({
      monthly_retainer_pence: 50000,
      stripe_customer_id: 'cus_new_1',
      stripe_subscription_id: 'sub_new_1',
      stripe_price_id: 'price_new_1',
      subscription_status: 'active',
    });
    expect(sentEmails).toHaveLength(1);
    expect(auditCalls).toHaveLength(1);
  });

  it('reuses an existing Stripe customer id rather than creating a second one', async () => {
    company!.stripe_customer_id = 'cus_existing';
    await PATCH(req({ monthly_retainer_pence: 50000 }), { params: params() });
    expect(createCustomerCalls).toHaveLength(0);
    expect(company).toMatchObject({ stripe_customer_id: 'cus_existing' });
  });

  it('refuses a zero/null retainer on first-time setup — Stripe is never called', async () => {
    const res = await PATCH(req({ monthly_retainer_pence: 0 }), { params: params() });
    expect(res.status).toBe(200);
    expect(createCustomerCalls).toHaveLength(0);
    // 0 is a valid, non-null number (>= 0), so it round-trips as 0 —
    // only an ENTIRELY missing/non-numeric field falls back to null.
    expect(company).toMatchObject({ monthly_retainer_pence: 0 });
  });
});

describe('PATCH /api/admin/clients/[id]/retainer — retainer change', () => {
  beforeEach(() => {
    company = {
      ...company,
      stripe_customer_id: 'cus_existing',
      stripe_subscription_id: 'sub_existing',
      stripe_price_id: 'price_old',
      monthly_retainer_pence: 40000,
    };
  });

  it('creates a new Price and swaps the subscription onto it — never creates a second customer or subscription', async () => {
    const res = await PATCH(req({ monthly_retainer_pence: 60000 }), { params: params() });
    expect(res.status).toBe(200);
    expect(createCustomerCalls).toHaveLength(0);
    expect(createSubscriptionCalls).toHaveLength(0);
    expect(createPriceCalls).toEqual([{ unitAmountPence: 60000 }]);
    expect(updateSubscriptionPriceCalls).toEqual([{ subscriptionId: 'sub_existing', newPriceId: 'price_new_1' }]);
    expect(company).toMatchObject({ stripe_price_id: 'price_new_1', monthly_retainer_pence: 60000 });
  });

  it('is a no-op in Stripe when the amount has not actually changed', async () => {
    const res = await PATCH(req({ monthly_retainer_pence: 40000 }), { params: params() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unchanged).toBe(true);
    expect(createPriceCalls).toHaveLength(0);
    expect(updateSubscriptionPriceCalls).toHaveLength(0);
  });

  it('does NOT re-send the billing-setup email on a retainer change — only first-time setup gets it', async () => {
    await PATCH(req({ monthly_retainer_pence: 60000 }), { params: params() });
    expect(sentEmails).toHaveLength(0);
  });

  it('a zero/null amount on an existing subscription updates the local value only, never touching Stripe', async () => {
    const res = await PATCH(req({ monthly_retainer_pence: null }), { params: params() });
    expect(res.status).toBe(200);
    expect(createPriceCalls).toHaveLength(0);
    expect(updateSubscriptionPriceCalls).toHaveLength(0);
    expect(company).toMatchObject({ monthly_retainer_pence: null, stripe_subscription_id: 'sub_existing' });
  });
});

describe('PATCH /api/admin/clients/[id]/retainer — failure handling', () => {
  it('refuses with 403 when the caller is not staff, touching neither Stripe nor the database', async () => {
    staffOk = false;
    const res = await PATCH(req({ monthly_retainer_pence: 50000 }), { params: params() });
    expect(res.status).toBe(403);
    expect(createCustomerCalls).toHaveLength(0);
    expect(updatedCompanies).toHaveLength(0);
  });

  it('refuses a malformed client id with 400 before any lookup', async () => {
    const res = await PATCH(req({ monthly_retainer_pence: 50000 }), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(res.status).toBe(400);
  });

  it('refuses with 404 for a client that does not exist', async () => {
    company = null;
    const res = await PATCH(req({ monthly_retainer_pence: 50000 }), { params: params() });
    expect(res.status).toBe(404);
  });

  it('refuses with 500 when Stripe is not configured and a Stripe path is actually needed', async () => {
    stripeIsConfigured = false;
    const res = await PATCH(req({ monthly_retainer_pence: 50000 }), { params: params() });
    expect(res.status).toBe(500);
    expect(createCustomerCalls).toHaveLength(0);
  });

  it('surfaces a Stripe failure as 500 and writes NOTHING locally — never a half-applied state', async () => {
    throwOnStripeCall = 'createSubscription';
    const res = await PATCH(req({ monthly_retainer_pence: 50000 }), { params: params() });
    expect(res.status).toBe(500);
    expect(company).toMatchObject({ stripe_subscription_id: null });
  });
});
