import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { stripeConfigured, createCustomer, createPrice, createSubscription } from '@/lib/stripe';
import { hasPaidFlag } from '@/lib/featureFlags';
import { sendEmail, clientWelcomeEmail } from '@/lib/email';

const DEFAULT_FLAGS = {
  hiring: true, documents: true, reports: false, support: true,
  metrics: false, compliance: false,
};

interface CreateClientBody {
  name?: string;
  slug?: string;
  sector?: string | null;
  size_band?: string | null;
  contact_email?: string | null;
  monthly_retainer_pence?: number | null;
  feature_flags?: Record<string, boolean>;
  /** TPS staff member who manages this client. */
  account_owner_id?: string | null;
}

interface CreateClientResult {
  company_id: string;
  stripe?: {
    customer_id?:     string;
    subscription_id?: string;
    price_id?:        string;
    status?:          string;
    error?:           string;
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const supabase = createServerSupabaseClient();

  let body: CreateClientBody = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
  }

  const retainerPence =
    typeof body.monthly_retainer_pence === 'number' && body.monthly_retainer_pence >= 0
      ? Math.round(body.monthly_retainer_pence)
      : null;

  const slug = (body.slug ?? '').trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Use the flags the admin selected on the create form, falling back
  // to a sensible default for callers that don't pass them. The form
  // always passes them today; the fallback covers programmatic create
  // calls and old clients of this endpoint.
  const flags: Record<string, boolean> =
    body.feature_flags && typeof body.feature_flags === 'object'
      ? { ...body.feature_flags }
      : { ...DEFAULT_FLAGS };

  // Free-only clients (no paid module ticked) don't go through the
  // portal onboarding wizard — none of its 5 steps (Friction Lens,
  // first employee, etc.) make sense for an A2I-only client. Skip
  // the wizard for them by writing the company-level "skip onboarding"
  // hint that the portal layout reads.
  const paidEnabled = hasPaidFlag(flags);

  // ── 1. Create the company row first (without Stripe IDs).
  // If Stripe creation fails afterwards, the company still exists and
  // admin can retry billing setup later. Avoids orphaning Stripe state
  // if our DB insert is the failure path.
  const { data: company, error: insertErr } = await supabase
    .from('companies')
    .insert({
      name,
      slug,
      sector:                  body.sector           ?? null,
      size_band:               body.size_band        ?? null,
      contact_email:           body.contact_email    ?? null,
      account_owner_id:        body.account_owner_id ?? null,
      active:                  true,
      feature_flags:           flags,
      monthly_retainer_pence:  paidEnabled ? retainerPence : null,
    })
    .select('id')
    .single();

  if (insertErr || !company) {
    return NextResponse.json({ error: insertErr?.message ?? 'Could not create client.' }, { status: 500 });
  }

  const result: CreateClientResult = { company_id: company.id };

  // ── 2. Stripe billing setup, only if a non-zero retainer was set,
  // at least one paid module is enabled, AND Stripe is configured.
  // Skips entirely otherwise — free-only clients never touch Stripe.
  if (paidEnabled && retainerPence && retainerPence > 0 && stripeConfigured()) {
    try {
      const customerId = await createCustomer({
        companyName:       name,
        contactEmail:      body.contact_email,
        metadataCompanyId: company.id,
      });
      const priceId = await createPrice({ unitAmountPence: retainerPence });
      const sub = await createSubscription({
        customerId,
        priceId,
        metadataCompanyId: company.id,
      });

      // Persist the Stripe identifiers on the company row.
      const { error: updErr } = await supabase
        .from('companies')
        .update({
          stripe_customer_id:      customerId,
          stripe_subscription_id:  sub.subscriptionId,
          stripe_price_id:         priceId,
          subscription_status:     sub.status,
          subscription_started_at: new Date(sub.currentPeriodStart * 1000).toISOString(),
        })
        .eq('id', company.id);

      if (updErr) {
        // The Stripe state is real; the local copy failed. Surface
        // both IDs so admin can reconcile manually.
        result.stripe = {
          customer_id:     customerId,
          subscription_id: sub.subscriptionId,
          price_id:        priceId,
          status:          sub.status,
          error:           `Saved in Stripe but local update failed: ${updErr.message}`,
        };
      } else {
        result.stripe = {
          customer_id:     customerId,
          subscription_id: sub.subscriptionId,
          price_id:        priceId,
          status:          sub.status,
        };
      }
    } catch (e: any) {
      // Surface the Stripe error but DO NOT undo the company row —
      // admin can retry billing setup from the edit-client UI.
      result.stripe = { error: e?.message ?? 'Stripe setup failed.' };
    }
  }

  auditLog({
    action:      'company.created',
    actor_id:    auth.userId,
    target_id:   company.id,
    target_type: 'company',
    metadata: {
      name,
      retainer_pence: retainerPence,
      stripe_customer_id: result.stripe?.customer_id,
    },
  });

  // Welcome email — fire-and-forget. If the contact_email is missing or
  // Resend isn't configured, sendEmail() logs and returns null without
  // throwing, so the API response is unaffected.
  if (body.contact_email) {
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
    await sendEmail(clientWelcomeEmail({
      to:             body.contact_email,
      companyName:    name,
      portalUrl,
      hasPaidModules: paidEnabled,
    }));
  }

  return NextResponse.json({ success: true, ...result });
}
