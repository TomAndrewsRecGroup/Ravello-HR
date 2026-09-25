import { wrapEmail, ctaButton, infoCard, BRAND } from '../layout';

// To the client's admins when a Health & Safety check is recorded as
// FAILED. Filled from the register row; nothing generated.

export interface HsCheckFailedInput {
  companyName: string;
  itemTitle:   string;
  completedOn: string;
  actionsUrl:  string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function hsCheckFailedEmail(input: HsCheckFailedInput) {
  const body = `
<p style="margin:0 0 8px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Health &amp; Safety</p>
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">A check on your register has failed</h1>
<p style="margin:0 0 16px 0;">A Health &amp; Safety check for <strong>${esc(input.companyName || 'your company')}</strong> was recorded as failed. An action has been added to your PROTECT actions so the remedial work is tracked; the register shows the item as in review until a pass is recorded.</p>
${infoCard([
    { label: 'Item',     value: esc(input.itemTitle) },
    { label: 'Recorded', value: esc(input.completedOn) },
    { label: 'Outcome',  value: 'Failed' },
  ])}
${ctaButton(input.actionsUrl, 'View the action')}
`.trim();

  return {
    subject: `Failed H&S check: ${input.itemTitle}`.slice(0, 150),
    html:    wrapEmail(body, `${input.itemTitle} was recorded as failed on ${input.completedOn}.`),
    tag:     'hs-check-failed',
  };
}
