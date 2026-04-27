import { wrapEmail, ctaButton, infoCard, BRAND } from '../layout';

export interface BillingSetupInput {
  to:           string | string[];
  companyName:  string;
  /** Pre-formatted price like "£499 / month". */
  retainerLabel: string;
  /** Pre-formatted next payment date or "Today". */
  firstChargeOn: string;
  /** Deep-link to /billing in the portal. */
  billingUrl:   string;
}

export function billingSetupEmail(input: BillingSetupInput) {
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Your retainer is set up</h1>
<p style="margin:0 0 16px 0;">Hi there — we've activated billing for <strong>${input.companyName}</strong>. Stripe will process the payment automatically; you don't need to do anything.</p>
${infoCard([
  { label: 'Retainer',     value: input.retainerLabel  },
  { label: 'First charge', value: input.firstChargeOn  },
])}
<p style="margin:0 0 16px 0;">You can view past invoices and update your payment method any time from your billing page.</p>
${ctaButton(input.billingUrl, 'View billing')}
<p style="margin:24px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">Stripe will email you a receipt after each successful payment. Reply to this email if you have any billing questions.</p>
`.trim();

  return {
    to:      input.to,
    subject: `Billing activated for ${input.companyName}`,
    html:    wrapEmail(body, `${input.retainerLabel} retainer is now active. First charge ${input.firstChargeOn}.`),
    tag:     'billing-setup',
  };
}
