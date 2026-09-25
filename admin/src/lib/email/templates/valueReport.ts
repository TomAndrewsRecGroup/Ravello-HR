import { wrapEmail, ctaButton, infoCard, BRAND } from '../layout';

// Sent by the monthly value-report auto-generation cron once the PDF
// has been rendered, uploaded and its `reports` row written. Signed
// links expire, so the email links to the portal's own Reports page
// (where the report is downloadable under the client's own session)
// rather than a signed URL that would go stale in the recipient's inbox.

export interface ValueReportEmailInput {
  to:          string;
  companyName: string;
  period:      string;
  reportsUrl:  string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function valueReportEmail(input: ValueReportEmailInput) {
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Your ${esc(input.period)} value report is ready</h1>
<p style="margin:0 0 16px 0;">A summary of what Core OS 360 delivered for ${esc(input.companyName)} last month — hiring, support, compliance and people-management activity — is ready in your portal.</p>
${infoCard([
    { label: 'Client', value: esc(input.companyName) },
    { label: 'Period', value: esc(input.period) },
  ])}
${ctaButton(input.reportsUrl, 'View your report')}
`.trim();

  return {
    to:      input.to,
    subject: `Your ${input.period} value report from Core OS 360`,
    html:    wrapEmail(body, `Your ${esc(input.period)} value report is ready to view.`),
    tag:     'value-report',
  };
}
