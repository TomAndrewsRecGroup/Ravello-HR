import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { revalidateClientDetail } from '@/app/actions';
import {
  stripeConfigured,
  createCustomer,
  createPrice,
  createSubscription,
  updateSubscriptionPrice,
} from '@/lib/stripe';
import { sendEmail, billingSetupEmail } from '@/lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx { params: { id: string } }
interface Body { monthly_retainer_pence?: number | null }

// PATCH /api/admin/clients/{company_id}/retainer
//
// Two distinct paths depending on existing Stripe state:
//
//   • First-time setup (no stripe_customer_id yet)
//       Creates Customer + Price + Subscription, persists IDs back.
//       Same flow as /api/admin/clients on first create.
//
//   • Retainer change (subscription already exists)
//       Creates a new Price at the new pence amount, swaps the
//       subscription's item onto it (with proration), archives the
//       old Price. Stripe handles the prorated charge/credit at the
//       next invoice.
//
// Setting the retainer to 0 / null is treated as a local-only update:
// we don't auto-cancel the subscription (admin may want to pause vs
// cancel; that's a separate flow). The local pence value drops to
// null but the subscription keeps running on its current Price until
// admin acts on it explicitly.

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });
  }

  let body: Body = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const newPence =
    typeof body.monthly_retainer_pence === 'number' && body.monthly_retainer_pence >= 0
      ? Math.round(body.monthly_retainer_pence)
      : null;

  const supabase = createServerSupabaseClient();

  // Pull the current row so we know whether to create or update.
  const { data: company, error: fetchErr } = await supabase
    .from('companies')
    .select('id, name, contact_email, stripe_customer_id, stripe_subscription_id, stripe_price_id, monthly_retainer_pence')
    .eq('id', params.id)
    .single();

  if (fetchErr || !company) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  // Always update the local pence value; Stripe state changes follow.
  const localUpdate: Record<string, unknown> = { monthly_retainer_pence: newPence };

  // Skip Stripe entirely if the new amount is 0/null AND there's no
  // existing subscription. Just store the local value.
  if (!newPence && !company.stripe_subscription_id) {
    const { error: upErr } = await supabase
      .from('companies')
      .update(localUpdate)
      .eq('id', params.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    await revalidateClientDetail(params.id);
    return NextResponse.json({ success: true, stripe: null });
  }

  // From here we need Stripe configured to continue.
  if (!stripeConfigured()) {
    return NextResponse.json({
      error: 'Stripe is not configured on the server. Set STRIPE_SECRET_KEY to manage billing.',
    }, { status: 500 });
  }

  let stripeUpdate: Record<string, unknown> = {};

  try {
    // ── Path A: first-time billing setup ─────────────────────────
    if (!company.stripe_subscription_id) {
      if (!newPence || newPence <= 0) {
        return NextResponse.json({
          error: 'A non-zero retainer is required to set up billing for the first time.',
        }, { status: 400 });
      }

      // Reuse customer if one exists (e.g. previous setup half-failed).
      let customerId = company.stripe_customer_id;
      if (!customerId) {
        customerId = await createCustomer({
          companyName:       company.name,
          contactEmail:      company.contact_email,
          metadataCompanyId: company.id,
        });
      }
      const priceId = await createPrice({ unitAmountPence: newPence });
      const sub = await createSubscription({
        customerId,
        priceId,
        metadataCompanyId: company.id,
      });

      stripeUpdate = {
        stripe_customer_id:      customerId,
        stripe_subscription_id:  sub.subscriptionId,
        stripe_price_id:         priceId,
        subscription_status:     sub.status,
        subscription_started_at: new Date(sub.currentPeriodStart * 1000).toISOString(),
      };

      auditLog({
        action:      'company.billing_setup',
        actor_id:    auth.userId,
        target_id:   company.id,
        target_type: 'company',
        metadata: {
          billing_first_setup: true,
          retainer_pence:      newPence,
          stripe_customer_id:  customerId,
        },
      });
    }
    // ── Path B: retainer change on existing subscription ─────────
    else if (newPence && newPence > 0) {
      // No-op if the amount hasn't actually changed.
      if (newPence === company.monthly_retainer_pence) {
        const { error: upErr } = await supabase
          .from('companies').update(localUpdate).eq('id', params.id);
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
        await revalidateClientDetail(params.id);
        return NextResponse.json({ success: true, unchanged: true });
      }

      const newPriceId = await createPrice({ unitAmountPence: newPence });
      await updateSubscriptionPrice({
        subscriptionId: company.stripe_subscription_id,
        newPriceId,
      });
      stripeUpdate = { stripe_price_id: newPriceId };
    }
    // ── Path C: zero/null amount on existing subscription ────────
    // Local update only. Admin can cancel via a future explicit flow.
  } catch (e: any) {
    return NextResponse.json({ error: `Stripe update failed: ${e?.message}` }, { status: 500 });
  }

  // Persist the combined updates.
  const { error: upErr } = await supabase
    .from('companies')
    .update({ ...localUpdate, ...stripeUpdate })
    .eq('id', params.id);
  if (upErr) {
    // Stripe was already mutated (customer/sub/price ids exist remotely)
    // but our local row didn't get the new ids. Surface the IDs and the
    // commit flag so admin can either retry the local update by hand or
    // reconcile in Stripe. Critical: do NOT roll back Stripe — that would
    // create a worse state (orphaned rows + double-charged customer).
    return NextResponse.json({
      error:            `Stripe state changed but local update failed: ${upErr.message}`,
      stripe_committed: true,
      stripe:           stripeUpdate,
    }, { status: 500 });
  }

  await revalidateClientDetail(params.id);

  // Send the billing-setup email only on the first-time setup path —
  // a retainer change shouldn't email the client every month with
  // "billing activated", and Stripe sends the actual receipts via its
  // own customer-emails setting.
  const isFirstTimeSetup =
    !company.stripe_subscription_id &&
    typeof stripeUpdate.stripe_subscription_id === 'string';

  if (isFirstTimeSetup && company.contact_email && newPence) {
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
    const retainerLabel = `£${(newPence / 100).toFixed(2)} / month`;
    await sendEmail(billingSetupEmail({
      to:            company.contact_email,
      companyName:   company.name,
      retainerLabel,
      firstChargeOn: 'Today',
      billingUrl:    `${portalUrl}/billing`,
    }));
  }

  return NextResponse.json({ success: true, stripe: stripeUpdate });
}
