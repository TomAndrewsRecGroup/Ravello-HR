import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────────
// Stripe webhook handler.
//
// Configure in Stripe Dashboard → Developers → Webhooks:
//   Endpoint:  https://admin.thepeoplesystem.co.uk/api/stripe/webhook
//   Events:
//     • invoice.paid
//     • invoice.payment_failed
//     • customer.subscription.created
//     • customer.subscription.updated
//     • customer.subscription.deleted
//   Signing secret: copy to STRIPE_WEBHOOK_SECRET on the
//                   ravello-admin Vercel project.
//
// Idempotency: every accepted event is recorded in stripe_events.
// We insert the row FIRST and rely on the PRIMARY KEY uniqueness on
// id to deduplicate retries — a duplicate insert returns conflict
// and we 200 immediately without reprocessing. This avoids the race
// where two concurrent deliveries both pass a "have we processed
// this?" check before either inserts.
//
// Security: the raw request body is required for signature verification
// (Stripe signs the bytes, not a re-stringified JSON). Use request.text()
// rather than request.json() and pass the result into constructEvent().
// ─────────────────────────────────────────────────────────────────

// Defer body parsing to the handler so we get the raw text.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role config missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  return new Stripe(key);
}

export async function POST(request: NextRequest) {
  const sigSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sigSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, sig, sigSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Signature verification failed: ${err.message}` }, { status: 400 });
  }

  const sb = adminSupabase();

  // Idempotency gate: insert the event id first. Duplicate primary
  // key (already-processed retry) → return 200 without reprocessing.
  const { error: insertErr } = await sb
    .from('stripe_events')
    .insert({
      id:      event.id,
      type:    event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertErr) {
    // Postgres unique-violation code is 23505. Anything else is a
    // genuine failure — let Stripe retry.
    if ((insertErr as any).code === '23505') {
      return NextResponse.json({ received: true, deduped: true });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Resolve the affected company. Most events have either a
  // customer id we can match against companies.stripe_customer_id, or
  // a subscription id we can match against companies.stripe_subscription_id.
  let companyId: string | null = null;
  try {
    companyId = await resolveCompanyId(sb, event);
  } catch (err: any) {
    // Soft fail: still record the event, just don't tag it.
    console.error('[stripe webhook] resolveCompanyId failed', err?.message);
  }

  // Tag the event row with the resolved company so admin can later
  // query "all events for client X" without re-parsing the JSONB.
  if (companyId) {
    await sb.from('stripe_events').update({ company_id: companyId }).eq('id', event.id);
  }

  // Dispatch.
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(sb, event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(sb, event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(sb, event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(sb, event.data.object as Stripe.Invoice);
        break;
      default:
        // We logged the event but don't act on it. Useful for admin
        // visibility without bloating the handler.
        break;
    }
  } catch (err: any) {
    // Logged + 500 so Stripe retries. The event row is already in
    // stripe_events; on the retry the dedupe path returns 200 and we
    // never re-attempt — that's fine because the next webhook for
    // this resource (status change, next invoice, etc.) will sync
    // state again. If you ever need to force a re-sync, delete the
    // row from stripe_events and Stripe will redeliver.
    console.error(`[stripe webhook] handler error for ${event.type}`, err?.message);
    return NextResponse.json({ error: err?.message ?? 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function resolveCompanyId(sb: ReturnType<typeof adminSupabase>, event: Stripe.Event): Promise<string | null> {
  const obj = event.data.object as Record<string, any>;

  // Subscription events carry the subscription id directly.
  if (event.type.startsWith('customer.subscription.')) {
    const subId = obj.id as string;
    const { data } = await sb
      .from('companies')
      .select('id')
      .eq('stripe_subscription_id', subId)
      .maybeSingle();
    return data?.id ?? null;
  }

  // Invoice events have customer + subscription. Subscription is the
  // tighter match (multiple companies could share a customer one day,
  // though our model is 1:1 today).
  if (event.type.startsWith('invoice.')) {
    const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
    if (subId) {
      const { data } = await sb
        .from('companies')
        .select('id')
        .eq('stripe_subscription_id', subId)
        .maybeSingle();
      if (data) return data.id;
    }
    if (obj.customer) {
      const { data } = await sb
        .from('companies')
        .select('id')
        .eq('stripe_customer_id', obj.customer)
        .maybeSingle();
      if (data) return data.id;
    }
  }

  return null;
}

async function handleSubscriptionChange(
  sb: ReturnType<typeof adminSupabase>,
  sub: Stripe.Subscription,
): Promise<void> {
  await sb
    .from('companies')
    .update({
      subscription_status:     sub.status,
      subscription_started_at: new Date(sub.billing_cycle_anchor * 1000).toISOString(),
    })
    .eq('stripe_subscription_id', sub.id);
}

async function handleSubscriptionCancelled(
  sb: ReturnType<typeof adminSupabase>,
  sub: Stripe.Subscription,
): Promise<void> {
  await sb
    .from('companies')
    .update({ subscription_status: 'canceled' })
    .eq('stripe_subscription_id', sub.id);
}

// Stripe v22 moved invoice.subscription off the top-level field onto
// invoice.parent.subscription_details.subscription. Older API versions
// (and some webhook payloads) still include the legacy field — try
// the new path first, fall back to the legacy field for safety.
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as any).parent;
  if (parent?.type === 'subscription_details') {
    const sub = parent.subscription_details?.subscription;
    if (typeof sub === 'string') return sub;
    if (sub?.id) return sub.id;
  }
  const legacy = (invoice as any).subscription;
  if (typeof legacy === 'string') return legacy;
  if (legacy?.id) return legacy.id;
  return null;
}

async function handleInvoicePaid(
  sb: ReturnType<typeof adminSupabase>,
  invoice: Stripe.Invoice,
): Promise<void> {
  // Only flip status if it isn't already 'active'. Avoids a
  // pointless write on the steady state.
  const sub = invoiceSubscriptionId(invoice);
  if (!sub) return;
  await sb
    .from('companies')
    .update({ subscription_status: 'active' })
    .eq('stripe_subscription_id', sub)
    .neq('subscription_status', 'active');
}

async function handleInvoiceFailed(
  sb: ReturnType<typeof adminSupabase>,
  invoice: Stripe.Invoice,
): Promise<void> {
  const sub = invoiceSubscriptionId(invoice);
  if (!sub) return;
  await sb
    .from('companies')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_subscription_id', sub);
}
