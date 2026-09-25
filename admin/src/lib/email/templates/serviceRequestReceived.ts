import { wrapEmail, ctaButton, infoCard, BRAND } from '../layout';

// Sent to the person who raised a service request, the moment the row
// exists. Before this a client pressed Submit, saw a green tick, and
// nothing anywhere confirmed that anybody would look at it.

export interface ServiceRequestReceivedInput {
  to:          string;
  subject:     string;
  requestType: string;
  urgency:     string | null;
  supportUrl:  string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function serviceRequestReceivedEmail(input: ServiceRequestReceivedInput) {
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">We've received your request</h1>
<p style="margin:0 0 16px 0;">Your account team at Core OS 360 has been notified and will respond within one business day. You can follow progress and read our reply in the portal.</p>
${infoCard([
    { label: 'Subject', value: esc(input.subject) },
    { label: 'Type',    value: esc(input.requestType) },
    ...(input.urgency ? [{ label: 'Urgency', value: esc(input.urgency) }] : []),
  ])}
${ctaButton(input.supportUrl, 'View your requests')}
`.trim();

  return {
    to:      input.to,
    subject: `Received: ${input.subject}`,
    html:    wrapEmail(body, `We've received "${esc(input.subject)}" and will respond within one business day.`),
    tag:     'service-request-received',
  };
}
