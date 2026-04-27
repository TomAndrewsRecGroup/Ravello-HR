import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import Topbar from '@/components/layout/Topbar';
import BillingClient from './BillingClient';
import { getOpenInvoiceUrl, stripeConfigured } from '@/lib/stripe';

export const metadata: Metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  active:             'Active',
  trialing:           'Trialing',
  past_due:           'Past due',
  canceled:           'Cancelled',
  unpaid:             'Unpaid',
  incomplete:         'Awaiting payment',
  incomplete_expired: 'Setup expired',
  paused:             'Paused',
};

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  active:             'good',
  trialing:           'good',
  past_due:           'bad',
  canceled:           'neutral',
  unpaid:             'bad',
  incomplete:         'warn',
  incomplete_expired: 'bad',
  paused:             'neutral',
};

export default async function BillingPage() {
  const { companyId, role, isTpsStaff } = await getSessionProfile();

  // Billing is super-user only. Editors and viewers don't see the menu
  // entry, but a direct URL also bounces them so RLS-light pages stay
  // honest.
  if (!isTpsStaff && role !== 'client_admin') redirect('/dashboard');

  // TPS staff can land here without a companyId (browsing the portal as
  // staff with no client picked). Avoid the empty .eq('id', '') query —
  // surface a clear "no company linked" message instead of the misleading
  // "Billing not set up yet" empty state.
  if (!companyId) {
    return (
      <>
        <Topbar title="Billing" subtitle="Manage retainer and invoices" />
        <main className="portal-page flex-1 max-w-[720px]">
          <div className="card p-7">
            <h2 className="font-display font-semibold text-base mb-1" style={{ color: 'var(--ink)' }}>
              No company linked
            </h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Your account is not linked to a client company. Open the admin
              dashboard to manage clients and their billing.
            </p>
          </div>
        </main>
      </>
    );
  }

  const supabase = createServerSupabaseClient();
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, monthly_retainer_pence, subscription_status, stripe_customer_id, stripe_subscription_id, billing_currency, subscription_started_at')
    .eq('id', companyId)
    .single();

  // If Stripe is unconfigured (preview env), or no subscription yet, the
  // page falls back to a "no billing on file" empty state — admin will
  // contact them to set things up.
  let payNowUrl: string | null = null;
  if (
    stripeConfigured() &&
    company?.stripe_subscription_id &&
    (company.subscription_status === 'incomplete' ||
     company.subscription_status === 'past_due' ||
     company.subscription_status === 'unpaid')
  ) {
    try {
      payNowUrl = await getOpenInvoiceUrl(company.stripe_subscription_id);
    } catch (err) {
      // Soft fail — page still renders, just without the CTA.
      console.error('[billing] getOpenInvoiceUrl failed', err);
    }
  }

  return (
    <>
      <Topbar title="Billing" subtitle="Your retainer, payment method and invoices" />
      <main className="portal-page flex-1 max-w-[720px] space-y-6">
        <BillingClient
          company={company ?? null}
          payNowUrl={payNowUrl}
          statusLabel={company?.subscription_status ? STATUS_LABEL[company.subscription_status] ?? company.subscription_status : null}
          statusTone={company?.subscription_status ? STATUS_TONE[company.subscription_status] ?? 'neutral' : 'neutral'}
        />
      </main>
    </>
  );
}
