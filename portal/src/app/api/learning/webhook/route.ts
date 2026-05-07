import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

/** Tolerance window for replay attack prevention (5 minutes) */
const TIMESTAMP_TOLERANCE_SEC = 300;

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // ── Verify Stripe webhook signature (HMAC-SHA256 + timing-safe compare) ──
  let event: any;
  try {
    // Parse signature header: "t=<ts>,v1=<sig>,v1=<sig>,..."
    const elements = new Map<string, string[]>();
    for (const part of sig.split(',')) {
      const [key, ...rest] = part.split('=');
      const val = rest.join('='); // rejoin in case value contains '='
      const list = elements.get(key) ?? [];
      list.push(val);
      elements.set(key, list);
    }

    const timestamp = elements.get('t')?.[0];
    const signatures = elements.get('v1') ?? [];

    if (!timestamp || signatures.length === 0) {
      return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
    }

    // Reject stale timestamps to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > TIMESTAMP_TOLERANCE_SEC) {
      return NextResponse.json({ error: 'Webhook timestamp too old' }, { status: 400 });
    }

    const expectedSig = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    // Check against ALL v1 signatures (Stripe sends multiple during key rotation)
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const isValid = signatures.some(s => {
      const actualBuf = Buffer.from(s, 'hex');
      return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  // Use service role for webhook operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Idempotency dedupe ──────────────────────────────────────
  // Stripe retries deliveries on any non-2xx; without this guard a
  // retry of charge.refunded would re-flip the row, and a retry of
  // checkout.session.completed would re-update + miss our row-count
  // assertion. The unique PK on stripe_events.id makes this race-
  // safe — a parallel retry hitting before the first finishes will
  // collide and we treat that as "already in flight".
  if (event.id) {
    const { error: dedupeErr } = await supabase
      .from('stripe_events')
      .insert({ id: event.id, type: event.type, payload: event });
    if (dedupeErr) {
      if ((dedupeErr as any).code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error('[learning/webhook] dedupe insert failed:', dedupeErr.message);
      return NextResponse.json({ error: 'Dedupe write failed' }, { status: 500 });
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { content_id, company_id } = session.metadata ?? {};

    if (!content_id || !company_id) {
      return NextResponse.json({ received: true });
    }

    const accessDays = parseInt(process.env.LEARNING_ACCESS_DAYS ?? '7', 10);
    const expiresAt = new Date(Date.now() + accessDays * 86400000).toISOString();

    // Use .select() so we can detect zero-row updates — if no pending
    // row matched (checkout-route insert never landed, or metadata
    // mis-tagged) we want to know rather than silently drop the
    // activation.
    const { data: updated, error: upErr } = await supabase
      .from('learning_purchases')
      .update({
        status:                'active',
        stripe_payment_intent: session.payment_intent,
        access_expires_at:     expiresAt,
        updated_at:            new Date().toISOString(),
      })
      .eq('stripe_session_id', session.id)
      .select('id');

    if (upErr) {
      console.error('[learning/webhook] activation update failed:', upErr.message);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      console.error('[learning/webhook] no learning_purchases row for session', session.id);
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const paymentIntent = charge.payment_intent;

    if (paymentIntent) {
      const { data: updated, error: upErr } = await supabase
        .from('learning_purchases')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('stripe_payment_intent', paymentIntent)
        .select('id');
      if (upErr) {
        console.error('[learning/webhook] refund update failed:', upErr.message);
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      if (!updated || updated.length === 0) {
        console.error('[learning/webhook] no learning_purchases row for PI', paymentIntent);
      }
    }
  }

  return NextResponse.json({ received: true });
}
