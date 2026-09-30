import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — Billing/
// Invoicing preservation test, slice 3: the retainer/invoice Stripe
// webhook (docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md §4), distinct
// from the E-Learning webhook (portal/.../learning/webhook, Group 4
// of this phase — same event source, two separate Stripe accounts,
// per CLAUDE.md's own "two Stripe integrations" note).
//
// Signature verification is exercised for REAL: this route uses the
// Stripe SDK's own webhooks.constructEvent(), so the test signs
// requests with the SDK's own webhooks.generateTestHeaderString() —
// the same construction Stripe itself recommends for webhook tests —
// against a real secret, never a mocked verifier.

const WEBHOOK_SECRET = 'whsec_test_dummy_secret';

let stripeEventsRows: Array<{ id: string; company_id: string | null }>;
let companies: Array<Record<string, unknown>>;
let oneOffInvoices: Array<Record<string, unknown>>;
let revalidateTagCalls: string[];
let companyRowsActuallyWritten: number;

vi.mock('next/cache', () => ({ revalidateTag: (tag: string) => { revalidateTagCalls.push(tag); } }));

function fakeClient() {
  return {
    from(table: string) {
      if (table === 'stripe_events') {
        return {
          insert: (row: { id: string; type: string; payload: unknown }) => {
            if (stripeEventsRows.some(r => r.id === row.id)) {
              return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
            }
            stripeEventsRows.push({ id: row.id, company_id: null });
            return Promise.resolve({ data: null, error: null });
          },
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              const row = stripeEventsRows.find(r => r.id === id);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === 'companies') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => ({
              maybeSingle: () => {
                const row = companies.find(c => c[col] === val);
                return Promise.resolve({ data: row ? { id: row.id } : null, error: null });
              },
            }),
          }),
          // Real chain order is .update(patch).eq(col, val).neq(col2, val2)
          // — .neq() is called AFTER .eq(), not before. So .eq() must
          // return something that is BOTH awaitable on its own (most
          // call sites chain nothing further) AND still exposes .neq()
          // for handleInvoicePaid's one "only if not already active"
          // guard — it must not eagerly apply the patch before knowing
          // whether a .neq() filter is still coming.
          update: (patch: Record<string, unknown>) => ({
            eq(col: string, val: unknown) {
              const matching = () => companies.filter(c => c[col] === val);
              const exec = (rows: Record<string, unknown>[]) => {
                companyRowsActuallyWritten += rows.length;
                for (const row of rows) Object.assign(row, patch);
                return Promise.resolve({ data: null, error: null });
              };
              return {
                neq: (col2: string, val2: unknown) => exec(matching().filter(r => r[col2] !== val2)),
                then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
                  exec(matching()).then(resolve, reject),
              };
            },
          }),
        };
      }
      if (table === 'one_off_invoices') {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: unknown) => {
              const rows = oneOffInvoices.filter(r => r[col] === val);
              for (const row of rows) Object.assign(row, patch);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }));

const { POST } = await import('../route');

// Stripe.Event is a large discriminated union keyed on `type`; there
// is no single Partial<Stripe.Event> shape a loosely-typed override
// object can satisfy across every call site below. Building the
// fixture as a plain record and casting once at the boundary is the
// practical way to construct an arbitrary test event — the real
// route only ever reads `id`, `type` and `data.object` off it, all of
// which are set explicitly by every caller.
function stripeEvent(overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: 'evt_1',
    object: 'event',
    api_version: '2025-01-01',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'customer.subscription.updated',
    data: { object: {} },
    ...overrides,
  } as unknown as Stripe.Event;
}

function signedRequest(event: Stripe.Event, opts: { badSig?: boolean; noSig?: boolean } = {}) {
  const body = JSON.stringify(event);
  let header: string;
  if (opts.noSig) {
    header = '';
  } else if (opts.badSig) {
    header = `t=${Math.floor(Date.now() / 1000)},v1=${'deadbeef'.repeat(8)}`;
  } else {
    header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
  }
  const headers: Record<string, string> = {};
  if (!opts.noSig) headers['stripe-signature'] = header;
  return new NextRequest('https://admin.example.com/api/stripe/webhook', { method: 'POST', body, headers });
}

beforeEach(() => {
  stripeEventsRows = [];
  companies = [];
  oneOffInvoices = [];
  revalidateTagCalls = [];
  companyRowsActuallyWritten = 0;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

describe('POST /api/stripe/webhook — signature verification', () => {
  it('refuses with 400 when the stripe-signature header is missing', async () => {
    const res = await POST(signedRequest(stripeEvent(), { noSig: true }));
    expect(res.status).toBe(400);
  });

  it('refuses with 400 when the signature does not match the body', async () => {
    const res = await POST(signedRequest(stripeEvent(), { badSig: true }));
    expect(res.status).toBe(400);
  });

  it('accepts a genuinely valid signature built the same way the Stripe SDK itself would', async () => {
    companies = [{ id: 'co-1', stripe_subscription_id: 'sub_1' }];
    const res = await POST(
      signedRequest(stripeEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', billing_cycle_anchor: 1_700_000_000 } as unknown } })),
    );
    expect(res.status).toBe(200);
  });

  it('refuses with 500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(signedRequest(stripeEvent()));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/stripe/webhook — idempotent replay', () => {
  it('a retried delivery of the same event id is deduped and never re-runs the handler', async () => {
    companies = [{ id: 'co-1', stripe_subscription_id: 'sub_1', subscription_status: 'past_due' }];
    const event = stripeEvent({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', billing_cycle_anchor: 1_700_000_000 } as unknown },
    });
    const first = await POST(signedRequest(event));
    expect(first.status).toBe(200);
    expect(companies[0].subscription_status).toBe('active');

    // Simulate the row being hand-corrected between deliveries — a
    // replayed event must NOT flip it back, proving the dedupe gate
    // genuinely short-circuits before the handler runs a second time.
    companies[0].subscription_status = 'past_due';
    const second = await POST(signedRequest(event));
    const secondBody = await second.json();
    expect(secondBody).toEqual({ received: true, deduped: true });
    expect(companies[0].subscription_status).toBe('past_due');
  });
});

describe('POST /api/stripe/webhook — customer.subscription.updated/created', () => {
  it('syncs subscription_status and subscription_started_at by matching stripe_subscription_id', async () => {
    companies = [{ id: 'co-1', stripe_subscription_id: 'sub_1', subscription_status: 'incomplete' }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'customer.subscription.updated',
          data: { object: { id: 'sub_1', status: 'trialing', billing_cycle_anchor: 1_700_000_000 } as unknown },
        }),
      ),
    );
    expect(companies[0]).toMatchObject({ subscription_status: 'trialing' });
    expect(companies[0].subscription_started_at).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('flushes the resolved company\'s cache tag', async () => {
    companies = [{ id: 'co-1', stripe_subscription_id: 'sub_1' }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'customer.subscription.updated',
          data: { object: { id: 'sub_1', status: 'active', billing_cycle_anchor: 1_700_000_000 } as unknown },
        }),
      ),
    );
    expect(revalidateTagCalls).toEqual(['client:co-1']);
  });
});

describe('POST /api/stripe/webhook — customer.subscription.deleted', () => {
  it('marks the company canceled', async () => {
    companies = [{ id: 'co-1', stripe_subscription_id: 'sub_1', subscription_status: 'active' }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'customer.subscription.deleted',
          data: { object: { id: 'sub_1' } as unknown },
        }),
      ),
    );
    expect(companies[0].subscription_status).toBe('canceled');
  });
});

describe('POST /api/stripe/webhook — invoice.paid', () => {
  it('flips a non-active retainer subscription to active, matched via the modern parent.subscription_details path', async () => {
    companies = [{ id: 'co-1', stripe_subscription_id: 'sub_1', subscription_status: 'past_due' }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'invoice.paid',
          data: {
            object: {
              id: 'in_1',
              customer: 'cus_1',
              parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
              metadata: {},
            } as unknown,
          },
        }),
      ),
    );
    expect(companies[0].subscription_status).toBe('active');
    // The neq('subscription_status','active') filter genuinely matched
    // (the row WAS past_due) and the write actually ran — a real, not
    // merely coincidental, flip to active.
    expect(companyRowsActuallyWritten).toBe(1);
  });

  it('is a no-op write when the subscription is already active (avoids a pointless update)', async () => {
    companies = [{ id: 'co-1', stripe_subscription_id: 'sub_1', subscription_status: 'active' }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'invoice.paid',
          data: {
            object: {
              id: 'in_1',
              customer: 'cus_1',
              parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
              metadata: {},
            } as unknown,
          },
        }),
      ),
    );
    expect(companies[0].subscription_status).toBe('active');
    // The discriminating assertion: neq('subscription_status','active')
    // means NO row matches when it's already active, so the write
    // genuinely never executes — not merely "wrote the same value".
    expect(companyRowsActuallyWritten).toBe(0);
  });

  it('also marks a tagged one-off invoice paid, with a paid_at timestamp', async () => {
    oneOffInvoices = [{ stripe_invoice_id: 'in_1', status: 'open', paid_at: null }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'invoice.paid',
          data: {
            object: {
              id: 'in_1',
              customer: 'cus_1',
              metadata: { tps_one_off: 'true' },
            } as unknown,
          },
        }),
      ),
    );
    expect(oneOffInvoices[0].status).toBe('paid');
    expect(oneOffInvoices[0].paid_at).toBeTruthy();
  });

  it('never touches a one-off invoice whose metadata does not mark it as one — retainer invoices are ignored here', async () => {
    oneOffInvoices = [{ stripe_invoice_id: 'in_1', status: 'open', paid_at: null }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'invoice.paid',
          data: { object: { id: 'in_1', customer: 'cus_1', metadata: {} } as unknown },
        }),
      ),
    );
    expect(oneOffInvoices[0].status).toBe('open');
  });
});

describe('POST /api/stripe/webhook — invoice.payment_failed', () => {
  it('marks the subscription past_due', async () => {
    companies = [{ id: 'co-1', stripe_subscription_id: 'sub_1', subscription_status: 'active' }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_1',
              customer: 'cus_1',
              parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
            } as unknown,
          },
        }),
      ),
    );
    expect(companies[0].subscription_status).toBe('past_due');
  });
});

describe('POST /api/stripe/webhook — invoice.voided / invoice.marked_uncollectible', () => {
  it('marks a tagged one-off invoice void', async () => {
    oneOffInvoices = [{ stripe_invoice_id: 'in_1', status: 'open' }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'invoice.voided',
          data: { object: { id: 'in_1', metadata: { tps_one_off: 'true' } } as unknown },
        }),
      ),
    );
    expect(oneOffInvoices[0].status).toBe('void');
  });

  it('marks a tagged one-off invoice uncollectible', async () => {
    oneOffInvoices = [{ stripe_invoice_id: 'in_1', status: 'open' }];
    await POST(
      signedRequest(
        stripeEvent({
          type: 'invoice.marked_uncollectible',
          data: { object: { id: 'in_1', metadata: { tps_one_off: 'true' } } as unknown },
        }),
      ),
    );
    expect(oneOffInvoices[0].status).toBe('uncollectible');
  });
});

describe('POST /api/stripe/webhook — unhandled event types', () => {
  it('still records and acknowledges an event type it does not act on', async () => {
    const res = await POST(signedRequest(stripeEvent({ type: 'charge.succeeded' })));
    expect(res.status).toBe(200);
    expect(stripeEventsRows).toHaveLength(1);
  });
});
