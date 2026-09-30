import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — Billing/
// Invoicing preservation test, slice 2: one-off invoice raising
// (docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md §4). This route's
// own header comment names why it matters most: it was "the one
// admin API with none [staff check]" until the role-cookie fix —
// its own requireStaff() refusal is pinned explicitly here.

const COMPANY_ID   = '11111111-1111-4111-8111-111111111111';
const RECIPIENT_ID = '22222222-2222-4222-8222-222222222222';

let staffOk: boolean;
let stripeIsConfigured: boolean;
let companies: Array<Record<string, unknown>>;
let profiles: Array<Record<string, unknown>>;
let invoicesInserted: Array<Record<string, unknown>>;
let raiseInvoiceCalls: unknown[];
let throwOnRaise: boolean;
let revalidateTagCalls: string[];

vi.mock('@/lib/auth/requireStaff', () => ({
  requireStaff: () =>
    Promise.resolve(
      staffOk ? { ok: true, userId: 'staff-1' } : { ok: false, response: new Response('no', { status: 403 }) },
    ),
}));

vi.mock('next/cache', () => ({ revalidateTag: (tag: string) => { revalidateTagCalls.push(tag); } }));

vi.mock('@/lib/stripe', () => ({
  stripeConfigured: () => stripeIsConfigured,
  createCustomer: () => Promise.resolve('cus_new_1'),
  raiseOneOffInvoice: (args: unknown) => {
    raiseInvoiceCalls.push(args);
    if (throwOnRaise) throw new Error('stripe invoice creation failed');
    return Promise.resolve({
      stripeInvoiceId: 'in_test_1',
      invoiceNumber: 'INV-0001',
      hostedUrl: 'https://invoice.stripe.com/i/in_test_1',
      pdfUrl: 'https://invoice.stripe.com/i/in_test_1.pdf',
      taxPence: 0,
    });
  },
}));

function fakeClient() {
  return {
    from(table: string) {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => ({
              single: () => {
                const row = companies.find(c => c[col] === val);
                return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: 'not found' } });
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: unknown) => {
              const row = companies.find(c => c[col] === val);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => ({
              single: () => {
                const row = profiles.find(p => p[col] === val);
                return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: 'not found' } });
              },
            }),
          }),
        };
      }
      if (table === 'one_off_invoices') {
        return {
          insert: (row: Record<string, unknown>) => {
            invoicesInserted.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }));

const { POST } = await import('../route');

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    package: 'HIRE',
    description: 'Retained search fee — Q3 placement',
    amount_net: 2500,
    payment_terms_days: 30,
    invoice_date: '2026-10-01',
    recipient_user_id: RECIPIENT_ID,
    ...overrides,
  };
}

function req(body: Record<string, unknown>) {
  return new NextRequest(`https://admin.example.com/api/admin/clients/${COMPANY_ID}/raise-invoice`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
const params = () => Promise.resolve({ id: COMPANY_ID });

beforeEach(() => {
  staffOk = true;
  stripeIsConfigured = true;
  throwOnRaise = false;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  companies = [{ id: COMPANY_ID, name: 'Acme Ltd', contact_email: 'billing@acme.example.com', stripe_customer_id: 'cus_existing' }];
  profiles = [{ id: RECIPIENT_ID, email: 'finance@acme.example.com', full_name: 'Finance Person', company_id: COMPANY_ID }];
  invoicesInserted = [];
  raiseInvoiceCalls = [];
  revalidateTagCalls = [];
});

describe('POST /api/admin/clients/[id]/raise-invoice — its own staff check', () => {
  it('refuses with 403 when the caller is not staff, before touching Stripe or the database', async () => {
    staffOk = false;
    const res = await POST(req(validBody()), { params: params() });
    expect(res.status).toBe(403);
    expect(raiseInvoiceCalls).toHaveLength(0);
    expect(invoicesInserted).toHaveLength(0);
  });
});

describe('POST /api/admin/clients/[id]/raise-invoice — the happy path', () => {
  it('raises the invoice in Stripe, records it locally and returns the hosted/pdf urls', async () => {
    const res = await POST(req(validBody()), { params: params() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, stripe_invoice_id: 'in_test_1', invoice_number: 'INV-0001' });
    expect(invoicesInserted).toHaveLength(1);
    expect(invoicesInserted[0]).toMatchObject({
      company_id: COMPANY_ID,
      package: 'HIRE',
      amount_net_pence: 250000,
      recipient_email: 'finance@acme.example.com',
      status: 'open',
      created_by: 'staff-1',
    });
  });

  it('computes the due date from the invoice date plus the chosen payment terms', async () => {
    await POST(req(validBody({ invoice_date: '2026-10-01', payment_terms_days: 14 })), { params: params() });
    expect(invoicesInserted[0]).toMatchObject({ invoice_date: '2026-10-01', due_date: '2026-10-15' });
  });

  it('takes created_by from the STAFF SESSION, never a client-supplied value', async () => {
    await POST(req(validBody({ created_by: 'someone-else' } as Record<string, unknown>)), { params: params() });
    expect(invoicesInserted[0].created_by).toBe('staff-1');
  });

  it('creates a Stripe customer for a client with none yet, and persists it', async () => {
    companies[0].stripe_customer_id = null;
    await POST(req(validBody()), { params: params() });
    expect(companies[0].stripe_customer_id).toBe('cus_new_1');
    expect(raiseInvoiceCalls[0]).toMatchObject({ customerId: 'cus_new_1' });
  });

  it('flushes the per-client cache tag after a successful raise', async () => {
    await POST(req(validBody()), { params: params() });
    expect(revalidateTagCalls).toEqual([`client:${COMPANY_ID}`]);
  });
});

describe('POST /api/admin/clients/[id]/raise-invoice — validation refuses BEFORE reaching Stripe', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['an unknown package', { package: 'NOT_A_PACKAGE' }],
    ['a missing description', { description: '' }],
    ['a description over 500 chars', { description: 'x'.repeat(501) }],
    ['a zero amount', { amount_net: 0 }],
    ['a negative amount', { amount_net: -10 }],
    ['an amount over the £1,000,000 ceiling', { amount_net: 1_000_001 }],
    ['payment terms that are neither 14 nor 30 days', { payment_terms_days: 21 }],
    ['an invalid invoice date', { invoice_date: 'not-a-date' }],
    ['no recipient chosen', { recipient_user_id: '' }],
  ];
  for (const [label, override] of cases) {
    it(`refuses ${label}`, async () => {
      const res = await POST(req(validBody(override)), { params: params() });
      expect(res.status).toBe(400);
      expect(raiseInvoiceCalls).toHaveLength(0);
      expect(invoicesInserted).toHaveLength(0);
    });
  }
});

describe('POST /api/admin/clients/[id]/raise-invoice — recipient must belong to this client', () => {
  it('refuses a recipient from a DIFFERENT company', async () => {
    profiles[0].company_id = 'a-different-company';
    const res = await POST(req(validBody()), { params: params() });
    expect(res.status).toBe(400);
    expect(raiseInvoiceCalls).toHaveLength(0);
  });

  it('refuses a recipient with no email on file', async () => {
    profiles[0].email = null;
    const res = await POST(req(validBody()), { params: params() });
    expect(res.status).toBe(400);
    expect(raiseInvoiceCalls).toHaveLength(0);
  });

  it('refuses with 404 for an unknown recipient id', async () => {
    const res = await POST(req(validBody({ recipient_user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })), { params: params() });
    expect(res.status).toBe(404);
  });

  it('refuses with 404 for an unknown client id', async () => {
    companies = [];
    const res = await POST(req(validBody()), { params: params() });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/clients/[id]/raise-invoice — Stripe unavailable / failing', () => {
  it('refuses with 503 when Stripe is not configured', async () => {
    stripeIsConfigured = false;
    const res = await POST(req(validBody()), { params: params() });
    expect(res.status).toBe(503);
  });

  it('reports 502 and records nothing locally when Stripe refuses the invoice', async () => {
    throwOnRaise = true;
    const res = await POST(req(validBody()), { params: params() });
    expect(res.status).toBe(502);
    expect(invoicesInserted).toHaveLength(0);
  });
});
