import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — E-Learning
// preservation test, slice 2: the Stripe webhook
// (docs/PROTECTED_LEGACY_REGRESSION_SCRIPTS.md §3): signature
// verification, idempotent replay (no duplicate access grant), and
// the access window respecting LEARNING_ACCESS_DAYS.
//
// The signature verification itself is REAL (node's own crypto, not
// mocked) — signRequestBody() below builds a genuinely valid header
// the same way Stripe does, so a test proving "an invalid signature
// is refused" is proving the route's own HMAC check, not a stub.

const WEBHOOK_SECRET = 'whsec_test_dummy_secret';

let stripeEventsRows: Array<{ id: string }>;
let learningPurchases: Array<Record<string, unknown>>;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      if (table === 'stripe_events') {
        return {
          insert: (row: { id: string; type: string; payload: unknown }) => {
            if (stripeEventsRows.some(r => r.id === row.id)) {
              return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
            }
            stripeEventsRows.push({ id: row.id });
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === 'learning_purchases') {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: unknown) => ({
              select: (_cols: string) => {
                const matches = learningPurchases.filter(r => r[col] === val);
                for (const row of matches) Object.assign(row, patch);
                return Promise.resolve({ data: matches.map(r => ({ id: r.id })), error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { POST } = await import('../route');

function signedRequest(event: Record<string, unknown>, opts: { timestamp?: number; badSig?: boolean; noSig?: boolean } = {}) {
  const body = JSON.stringify(event);
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const sig = opts.badSig
    ? 'deadbeef'.repeat(8)
    : createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
  const headers: Record<string, string> = {};
  if (!opts.noSig) headers['stripe-signature'] = `t=${timestamp},v1=${sig}`;
  return new NextRequest('https://portal.example.com/api/learning/webhook', { method: 'POST', body, headers });
}

beforeEach(() => {
  stripeEventsRows = [];
  learningPurchases = [];
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  delete process.env.LEARNING_ACCESS_DAYS;
});

describe('POST /api/learning/webhook — signature verification', () => {
  it('refuses with 400 when the stripe-signature header is missing', async () => {
    const res = await POST(signedRequest({ id: 'evt_1', type: 'ping' }, { noSig: true }));
    expect(res.status).toBe(400);
  });

  it('refuses with 400 when the signature does not match the body', async () => {
    const res = await POST(signedRequest({ id: 'evt_1', type: 'ping' }, { badSig: true }));
    expect(res.status).toBe(400);
  });

  it('refuses with 400 when the timestamp is outside the 5-minute replay window', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 400;
    const res = await POST(signedRequest({ id: 'evt_1', type: 'ping' }, { timestamp: staleTimestamp }));
    expect(res.status).toBe(400);
  });

  it('accepts a genuinely valid signature within the tolerance window', async () => {
    const res = await POST(signedRequest({ id: 'evt_1', type: 'ping' }));
    expect(res.status).toBe(200);
  });

  it('refuses with 500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(signedRequest({ id: 'evt_1', type: 'ping' }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/learning/webhook — idempotent replay', () => {
  it('records a fresh event id in stripe_events on first delivery', async () => {
    await POST(signedRequest({ id: 'evt_abc', type: 'ping' }));
    expect(stripeEventsRows).toEqual([{ id: 'evt_abc' }]);
  });

  it('a retried delivery of the same event id is reported as a duplicate and grants no second access', async () => {
    learningPurchases = [{ id: 'row-1', stripe_session_id: 'cs_1', status: 'pending' }];
    const event = {
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_intent: 'pi_1', metadata: { content_id: 'content-1', company_id: 'co-1' } } },
    };
    const first = await POST(signedRequest(event));
    expect(first.status).toBe(200);
    expect(learningPurchases[0].status).toBe('active');

    // A second, identical delivery (Stripe's own retry behaviour) must
    // not re-run the activation logic at all.
    learningPurchases[0].status = 'active'; // sanity: unchanged by the first call's own re-run risk
    const second = await POST(signedRequest(event));
    const secondBody = await second.json();
    expect(secondBody).toEqual({ received: true, duplicate: true });
    expect(learningPurchases).toHaveLength(1);
  });
});

describe('POST /api/learning/webhook — checkout.session.completed', () => {
  it('activates the matching pending purchase and sets an access window from LEARNING_ACCESS_DAYS', async () => {
    process.env.LEARNING_ACCESS_DAYS = '14';
    learningPurchases = [{ id: 'row-1', stripe_session_id: 'cs_1', status: 'pending' }];
    const before = Date.now();
    const res = await POST(
      signedRequest({
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', payment_intent: 'pi_1', metadata: { content_id: 'content-1', company_id: 'co-1' } } },
      }),
    );
    expect(res.status).toBe(200);
    expect(learningPurchases[0].status).toBe('active');
    expect(learningPurchases[0].stripe_payment_intent).toBe('pi_1');
    const expiresAt = new Date(learningPurchases[0].access_expires_at as string).getTime();
    const expectedDays = 14 * 86400000;
    expect(expiresAt - before).toBeGreaterThan(expectedDays - 5000);
    expect(expiresAt - before).toBeLessThan(expectedDays + 5000);
  });

  it('defaults the access window to 7 days when LEARNING_ACCESS_DAYS is unset', async () => {
    learningPurchases = [{ id: 'row-1', stripe_session_id: 'cs_1', status: 'pending' }];
    const before = Date.now();
    await POST(
      signedRequest({
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', payment_intent: 'pi_1', metadata: { content_id: 'content-1', company_id: 'co-1' } } },
      }),
    );
    const expiresAt = new Date(learningPurchases[0].access_expires_at as string).getTime();
    const expectedDays = 7 * 86400000;
    expect(expiresAt - before).toBeGreaterThan(expectedDays - 5000);
    expect(expiresAt - before).toBeLessThan(expectedDays + 5000);
  });

  it('never throws when metadata is missing content_id or company_id — just acknowledges', async () => {
    const res = await POST(
      signedRequest({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: {} } } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('is a no-op (but still 200) when no pending purchase row matches the session id', async () => {
    const res = await POST(
      signedRequest({
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_no_match', payment_intent: 'pi_1', metadata: { content_id: 'content-1', company_id: 'co-1' } } },
      }),
    );
    expect(res.status).toBe(200);
    expect(learningPurchases).toHaveLength(0);
  });
});

describe('POST /api/learning/webhook — charge.refunded', () => {
  it('marks the matching purchase refunded by payment_intent', async () => {
    learningPurchases = [{ id: 'row-1', stripe_payment_intent: 'pi_1', status: 'active' }];
    const res = await POST(
      signedRequest({ id: 'evt_2', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1' } } }),
    );
    expect(res.status).toBe(200);
    expect(learningPurchases[0].status).toBe('refunded');
  });

  it('does nothing when the refund event carries no payment_intent', async () => {
    const res = await POST(
      signedRequest({ id: 'evt_2', type: 'charge.refunded', data: { object: {} } }),
    );
    expect(res.status).toBe(200);
  });
});
