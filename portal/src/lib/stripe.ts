import Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────────
// Portal-side Stripe helpers.
//
// The portal only ever READS Stripe (or asks Stripe to mint a hosted
// session URL the user is redirected to). All write paths — creating
// customers, subscriptions, prices — live in the admin app where
// staff trigger them. The portal never amends the £ amount or
// otherwise mutates billing state.
// ─────────────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;
function client(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  _stripe = new Stripe(key);
  return _stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Returns the hosted_invoice_url for the most recent open / unpaid invoice
 * on the given subscription, or null if none. Used to surface a "Pay your
 * first invoice" CTA when a subscription was created with
 * payment_behavior: 'default_incomplete' and the customer hasn't paid yet.
 *
 * Best-effort: Stripe is eventually consistent across regions, so a
 * brand-new invoice may not appear in this list for a few seconds after
 * Stripe creates it. The hosted Stripe Customer Portal is the source of
 * truth — surface this URL only as a one-click shortcut.
 */
export async function getOpenInvoiceUrl(subscriptionId: string): Promise<string | null> {
  const sb = client();
  const invoices = await sb.invoices.list({
    subscription: subscriptionId,
    limit:        5,
    status:       'open',
  });
  // Most recent first; pick the first one with a hosted URL.
  for (const inv of invoices.data) {
    if (inv.hosted_invoice_url) return inv.hosted_invoice_url;
  }
  return null;
}

/**
 * Creates a Stripe-hosted Billing Portal session for the given customer.
 * Lets the user manage their card on file, view past invoices, and
 * download receipts. After they're done they're redirected to returnUrl.
 *
 * Requires a Billing Portal configuration to exist in the Stripe
 * dashboard — Stripe creates a default one automatically the first time.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl:  string,
): Promise<string> {
  const sb = client();
  const session = await sb.billingPortal.sessions.create({
    customer:   customerId,
    return_url: returnUrl,
  });
  return session.url;
}
