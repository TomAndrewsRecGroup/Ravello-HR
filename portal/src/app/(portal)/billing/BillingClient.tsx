'use client';
import { useState } from 'react';
import { CreditCard, ExternalLink, Loader2, Receipt, AlertTriangle, Check } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  monthly_retainer_pence: number | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_currency: string | null;
  subscription_started_at: string | null;
}

interface Props {
  company:     Company | null;
  payNowUrl:   string | null;
  statusLabel: string | null;
  statusTone:  'good' | 'warn' | 'bad' | 'neutral';
}

const TONE_BADGE: Record<Props['statusTone'], string> = {
  good:    'badge-active',
  warn:    'badge-inprogress',
  bad:     'badge-urgent',
  neutral: 'badge-inactive',
};

function fmtMoney(pence: number | null, currency: string | null): string {
  if (pence == null) return '-';
  const symbol = (currency ?? 'gbp').toLowerCase() === 'gbp' ? '£' : '$';
  return `${symbol}${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BillingClient({ company, payNowUrl, statusLabel, statusTone }: Props) {
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Empty state: no Stripe state at all yet.
  if (!company || !company.stripe_subscription_id) {
    return (
      <div className="card p-7">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            <CreditCard size={22} />
          </div>
          <div>
            <h2 className="font-display font-semibold text-base mb-1" style={{ color: 'var(--ink)' }}>
              Billing not set up yet
            </h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Your retainer is arranged directly with your account manager.
              Once they configure your billing in our admin tool you'll see your retainer,
              payment method and past invoices here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function openPortal() {
    setOpeningPortal(true);
    setError(null);
    try {
      const res  = await fetch('/api/billing/portal-session', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? 'Could not open the billing portal.');
        setOpeningPortal(false);
        return;
      }
      window.location.href = json.url;
    } catch (e: any) {
      setError(e?.message ?? 'Could not open the billing portal.');
      setOpeningPortal(false);
    }
  }

  const needsPayment =
    company.subscription_status === 'incomplete' ||
    company.subscription_status === 'past_due' ||
    company.subscription_status === 'unpaid';

  return (
    <>
      {/* Pay-now banner: only when we successfully fetched an open invoice URL */}
      {needsPayment && payNowUrl && (
        <div
          className="card p-5 flex items-start gap-3"
          style={{ borderColor: 'var(--rose)', background: 'rgba(220,38,38,0.04)' }}
        >
          <div className="flex-shrink-0 mt-0.5" style={{ color: 'var(--rose)' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
              {company.subscription_status === 'incomplete'
                ? 'Action needed: add your payment method'
                : 'Action needed: settle your latest invoice'}
            </p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--ink-soft)' }}>
              {company.subscription_status === 'incomplete'
                ? 'Your subscription is set up but no card is on file yet. Use the secure Stripe page to enter your card and finalise the first invoice.'
                : 'Your most recent invoice is unpaid. Settle it to keep your services running without interruption.'}
            </p>
            <a
              href={payNowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cta btn-sm inline-flex items-center gap-2"
            >
              <CreditCard size={14} /> Pay securely on Stripe <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* Retainer summary card */}
      <div className="card p-7">
        <div className="flex items-center justify-between mb-5">
          <p className="eyebrow">Your retainer</p>
          {statusLabel && (
            <span className={`badge ${TONE_BADGE[statusTone]}`}>{statusLabel}</span>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Monthly retainer</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>
                {fmtMoney(company.monthly_retainer_pence, company.billing_currency)}
              </p>
              {company.monthly_retainer_pence ? (
                <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>/ month</span>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Billing started</p>
            <p className="font-display font-semibold text-base mt-1" style={{ color: 'var(--ink)' }}>
              {company.subscription_started_at
                ? new Date(company.subscription_started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                : '-'}
            </p>
          </div>
        </div>

        <p className="text-xs mt-5 pt-5 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink-faint)' }}>
          To change your retainer or services, please speak to your account manager.
          Stripe handles any prorated charges automatically.
        </p>
      </div>

      {/* Manage card / view invoices */}
      <div className="card p-7">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-1" style={{ color: 'var(--purple)' }}>
            <Receipt size={20} />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-semibold text-base mb-1" style={{ color: 'var(--ink)' }}>
              Manage payment method and invoices
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
              Open the secure Stripe customer portal to update your card,
              view all past invoices and download receipts for your records.
            </p>
            <button
              onClick={openPortal}
              disabled={openingPortal}
              className="btn-cta inline-flex items-center gap-2"
            >
              {openingPortal
                ? <><Loader2 size={14} className="animate-spin" /> Opening</>
                : <>Open Stripe portal <ExternalLink size={14} /></>}
            </button>
            {error && <p className="text-xs mt-3" style={{ color: 'var(--rose)' }}>{error}</p>}
          </div>
        </div>
      </div>

      {/* Reassurance footer */}
      <div className="flex items-start gap-3 px-2" style={{ color: 'var(--ink-faint)' }}>
        <Check size={14} className="flex-shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          Card details are never stored on our servers. Stripe (PCI Level 1) handles
          all card capture and payment confirmation.
        </p>
      </div>
    </>
  );
}
