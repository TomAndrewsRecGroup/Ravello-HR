import Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────────
// Stripe client singleton + thin per-action helpers.
//
// Pricing model (locked with user, see migration 048):
//   • One Stripe Customer per company.
//   • One shared Product called "Monthly Retainer".
//   • Per-company Price (recurring monthly, custom unit_amount).
//   • One Subscription per company, pointing at that Price.
//   • Changing the £ amount creates a new Price, swaps the
//     subscription onto it (with proration), archives the old Price.
// ─────────────────────────────────────────────────────────────────

const RETAINER_PRODUCT_NAME = 'The People System Monthly Retainer';

// Legal entity that issues every invoice. The Stripe account itself is
// owned by Andrews Recruitment Group Limited; "The People System" is the
// trading name. We surface this on every invoice (retainer + one-off)
// via the customer's invoice_settings.footer so it shows on the PDF
// regardless of who creates the invoice.
const INVOICE_LEGAL_FOOTER =
  'Andrews Recruitment Group Limited t/a The People System';

let _stripe: Stripe | null = null;
function client(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  // Don't pin the API version — let the SDK use the version it was
  // typed against. Pinning to a specific date string causes a TS
  // mismatch with the SDK's narrowed LatestApiVersion type and gives
  // no real benefit since we update the SDK + Stripe dashboard version
  // together as part of dependency upgrades.
  _stripe = new Stripe(key);
  return _stripe;
}

/** True iff Stripe is configured. Used to short-circuit on dev/preview. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// ─────────────────────────────────────────────────────────────────
// Product cache: we look up the shared Retainer product on first use,
// or create it if missing. Cached process-wide so subsequent client
// creations don't keep round-tripping to fetch.
// ─────────────────────────────────────────────────────────────────
let _retainerProductId: string | null = null;
async function getRetainerProductId(): Promise<string> {
  if (_retainerProductId) return _retainerProductId;
  const sb = client();

  // Try to find an existing product with the canonical name.
  const search = await sb.products.search({
    query: `active:'true' AND name:'${RETAINER_PRODUCT_NAME}'`,
    limit: 1,
  });
  if (search.data.length > 0) {
    _retainerProductId = search.data[0].id;
    return _retainerProductId;
  }

  // First call ever: create the product.
  const created = await sb.products.create({
    name: RETAINER_PRODUCT_NAME,
    description: 'Monthly retainer engagement with The People System.',
  });
  _retainerProductId = created.id;
  return _retainerProductId;
}

// ─────────────────────────────────────────────────────────────────
// Per-company helpers
// ─────────────────────────────────────────────────────────────────

interface CreateCustomerArgs {
  companyName: string;
  contactEmail?: string | null;
  metadataCompanyId: string;
}

/** Creates a Stripe Customer for a company. Returns the customer id. */
export async function createCustomer(args: CreateCustomerArgs): Promise<string> {
  const sb = client();
  const customer = await sb.customers.create({
    name:        args.companyName,
    email:       args.contactEmail ?? undefined,
    description: `The People System client: ${args.companyName}`,
    // Tag with our company UUID so webhook handlers can resolve the
    // local row without a separate lookup.
    metadata: { tps_company_id: args.metadataCompanyId },
    // Legal-entity footer applied to every invoice for this customer
    // (retainer + one-off). Stripe inherits invoice_settings.footer
    // onto each generated invoice unless overridden.
    invoice_settings: { footer: INVOICE_LEGAL_FOOTER },
  });
  return customer.id;
}

interface CreatePriceArgs {
  unitAmountPence: number;
  currency?: string; // default 'gbp'
}

/** Creates a recurring monthly Price for the given pence amount. */
export async function createPrice(args: CreatePriceArgs): Promise<string> {
  const sb = client();
  const productId = await getRetainerProductId();
  const price = await sb.prices.create({
    product:     productId,
    currency:    args.currency ?? 'gbp',
    unit_amount: args.unitAmountPence,
    recurring:   { interval: 'month' },
  });
  return price.id;
}

interface CreateSubscriptionArgs {
  customerId: string;
  priceId:    string;
  metadataCompanyId: string;
}

interface CreateSubscriptionResult {
  subscriptionId: string;
  status:         Stripe.Subscription.Status;
  currentPeriodStart: number;
}

/**
 * Creates a Subscription that bills monthly at the given Price.
 * The Customer must already have a default payment method, OR the
 * subscription is created with `payment_behavior: 'default_incomplete'`
 * so the client portal can collect the card afterwards. We use the
 * latter so admin can set up clients without their card on file yet.
 */
export async function createSubscription(args: CreateSubscriptionArgs): Promise<CreateSubscriptionResult> {
  const sb = client();
  const sub = await sb.subscriptions.create({
    customer: args.customerId,
    items:    [{ price: args.priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand:   ['latest_invoice.payment_intent'],
    metadata: { tps_company_id: args.metadataCompanyId },
  });
  // Stripe SDK v22 dropped the top-level current_period_start in favour
  // of billing_cycle_anchor. For a brand-new subscription, the anchor
  // IS the start of the first period — same field, new name. Use that
  // for our subscription_started_at column.
  return {
    subscriptionId:     sub.id,
    status:             sub.status,
    currentPeriodStart: sub.billing_cycle_anchor,
  };
}

interface UpdateSubscriptionPriceArgs {
  subscriptionId: string;
  newPriceId:     string;
  /** Default true — Stripe credits/charges the prorated diff at next invoice. */
  prorate?: boolean;
}

/**
 * Swaps the subscription onto a new Price. The old Price is archived
 * (set inactive) so admin can't accidentally reuse it; historical
 * invoices still reference it correctly.
 */
export async function updateSubscriptionPrice(
  args: UpdateSubscriptionPriceArgs,
): Promise<void> {
  const sb = client();
  // Need the existing item id to do an item-level swap rather than a
  // recreate (which would terminate + restart the sub).
  const sub = await sb.subscriptions.retrieve(args.subscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new Error('Subscription has no items.');

  const oldPriceId = item.price.id;

  await sb.subscriptions.update(args.subscriptionId, {
    items: [{ id: item.id, price: args.newPriceId }],
    proration_behavior: args.prorate === false ? 'none' : 'create_prorations',
  });

  // Archive the previous Price so it doesn't appear on future create
  // pickers. Best-effort — failure here doesn't affect the swap.
  if (oldPriceId && oldPriceId !== args.newPriceId) {
    try {
      await sb.prices.update(oldPriceId, { active: false });
    } catch {
      // ignore — archival is housekeeping, not critical
    }
  }
}

/** Cancels a subscription at period end. The customer keeps access until then. */
/**
 * Best-effort detach: cancel the live subscription IMMEDIATELY (no
 * proration) and delete the customer. Used by the hard-delete-client
 * flow so we don't keep billing a customer that no longer exists in
 * the app DB. Errors are caught + returned to the caller as strings
 * so the deletion route can surface them rather than fail the whole
 * cascade.
 */
export async function detachAndDeleteStripeCustomer(args: {
  customerId?:     string | null;
  subscriptionId?: string | null;
}): Promise<{ ok: true } | { ok: false; warnings: string[] }> {
  if (!stripeConfigured()) return { ok: true };
  const warnings: string[] = [];
  const sb = client();

  if (args.subscriptionId) {
    try {
      await sb.subscriptions.cancel(args.subscriptionId, { invoice_now: false, prorate: false });
    } catch (e) {
      warnings.push(`subscription cancel failed: ${(e as Error).message}`);
    }
  }
  if (args.customerId) {
    try {
      await sb.customers.del(args.customerId);
    } catch (e) {
      warnings.push(`customer delete failed: ${(e as Error).message}`);
    }
  }
  return warnings.length ? { ok: false, warnings } : { ok: true };
}

export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<void> {
  const sb = client();
  await sb.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

// ─────────────────────────────────────────────────────────────────
// One-off invoices (separate from the monthly retainer)
// ─────────────────────────────────────────────────────────────────

const VAT_RATE_DISPLAY_NAME = 'TPS UK VAT 20%';
let _vatTaxRateId: string | null = null;

async function getVatTaxRateId(): Promise<string> {
  if (_vatTaxRateId) return _vatTaxRateId;
  const sb = client();
  const list = await sb.taxRates.list({ active: true, limit: 100 });
  const existing = list.data.find(
    r => r.display_name === VAT_RATE_DISPLAY_NAME && r.percentage === 20 && r.country === 'GB',
  );
  if (existing) {
    _vatTaxRateId = existing.id;
    return existing.id;
  }
  const created = await sb.taxRates.create({
    display_name: VAT_RATE_DISPLAY_NAME,
    percentage:   20,
    inclusive:    false,
    country:      'GB',
    jurisdiction: 'GB',
    description:  'United Kingdom VAT (standard rate).',
  });
  _vatTaxRateId = created.id;
  return created.id;
}

interface RaiseOneOffInvoiceArgs {
  customerId:        string;
  recipientEmail:    string;
  description:       string;
  amountNetPence:    number;
  paymentTermsDays:  14 | 30;
  invoiceDate:       Date;
  dueDate:           Date;
  packageLabel:      'HIRE' | 'LEAD' | 'PROTECT' | 'OTHER';
  companyId:         string;
  syncCustomerEmail?: boolean;
}

interface RaiseOneOffInvoiceResult {
  stripeInvoiceId: string;
  invoiceNumber:   string | null;
  hostedUrl:       string | null;
  pdfUrl:          string | null;
  taxPence:        number;
}

/**
 * Issues a Stripe-hosted invoice with 20% VAT applied.
 *
 * Sets customer.email to the chosen recipient before send so Stripe's
 * invoice email lands in the right inbox. Creates a pending
 * InvoiceItem with the 20% UK VAT TaxRate, then creates the Invoice
 * with `pending_invoice_items_behavior: 'include'` to bundle it,
 * finalises and sends. Stripe emails the hosted-pay link + PDF.
 */
export async function raiseOneOffInvoice(
  args: RaiseOneOffInvoiceArgs,
): Promise<RaiseOneOffInvoiceResult> {
  const sb = client();

  if (args.syncCustomerEmail !== false) {
    await sb.customers.update(args.customerId, {
      email: args.recipientEmail,
      // Backfill the legal-entity footer on customers that pre-date
      // the invoice_settings.footer change, so older clients get the
      // trading-name line on this invoice and all future ones.
      invoice_settings: { footer: INVOICE_LEGAL_FOOTER },
    });
  }

  const taxRateId = await getVatTaxRateId();
  await sb.invoiceItems.create({
    customer:    args.customerId,
    amount:      args.amountNetPence,
    currency:    'gbp',
    description: args.description,
    tax_rates:   [taxRateId],
  });

  const dueUnix = Math.floor(args.dueDate.getTime() / 1000);
  const invoice = await sb.invoices.create({
    customer:          args.customerId,
    collection_method: 'send_invoice',
    due_date:          dueUnix,
    pending_invoice_items_behavior: 'include',
    auto_advance:      false,
    description:       `${args.packageLabel} — ${args.description}`,
    footer:            INVOICE_LEGAL_FOOTER,
    custom_fields: [
      { name: 'Invoice date',    value: args.invoiceDate.toISOString().slice(0, 10) },
      { name: 'Payment terms',   value: `${args.paymentTermsDays} days` },
      { name: 'Package',         value: args.packageLabel },
    ],
    metadata: {
      tps_one_off:    'true',
      tps_company_id: args.companyId,
      tps_package:    args.packageLabel,
      tps_terms_days: String(args.paymentTermsDays),
    },
  });

  const finalized = await sb.invoices.finalizeInvoice(invoice.id!);
  const sent      = await sb.invoices.sendInvoice(finalized.id!);

  // Stripe removed the top-level `tax` field on Invoice — tax is now
  // exposed via `total_taxes[].amount` (or, on older API versions,
  // `total_tax_amounts[].amount`). Fall back to total − subtotal so
  // we tolerate either shape and any future renames.
  const sentAny = sent as unknown as {
    total?: number | null;
    subtotal?: number | null;
    total_taxes?: Array<{ amount?: number | null }> | null;
    total_tax_amounts?: Array<{ amount?: number | null }> | null;
  };
  const sumAmounts = (arr?: Array<{ amount?: number | null }> | null): number =>
    (arr ?? []).reduce((acc, t) => acc + (t.amount ?? 0), 0);
  const taxPence =
    sumAmounts(sentAny.total_taxes) ||
    sumAmounts(sentAny.total_tax_amounts) ||
    Math.max(0, (sentAny.total ?? 0) - (sentAny.subtotal ?? 0));

  return {
    stripeInvoiceId: sent.id!,
    invoiceNumber:   sent.number ?? null,
    hostedUrl:       sent.hosted_invoice_url ?? null,
    pdfUrl:          sent.invoice_pdf ?? null,
    taxPence,
  };
}

export async function voidOneOffInvoice(stripeInvoiceId: string): Promise<void> {
  const sb = client();
  await sb.invoices.voidInvoice(stripeInvoiceId);
}

/** Re-export the SDK constructor for any callsite that needs raw access. */
export { Stripe };
