import { wrapEmail, ctaButton, BRAND } from '../layout';

export interface ServiceRequestResponseInput {
  to:             string | string[];
  companyName:    string;
  requestSubject: string;
  responseNote:   string;
  /** Deep-link to /support in the portal. */
  supportUrl:     string;
}

export function serviceRequestResponseEmail(input: ServiceRequestResponseInput) {
  // Quote-style block for the original subject + response note.
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">We've responded to your request</h1>
<p style="margin:0 0 16px 0;">Your account team at The People System has responded to a service request from <strong>${input.companyName}</strong>.</p>
<div style="margin:16px 0;padding:16px;border-left:3px solid ${BRAND.purple};background:${BRAND.surfaceLt};border-radius:0 8px 8px 0;">
  <p style="margin:0 0 8px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Your request</p>
  <p style="margin:0 0 12px 0;font-size:14px;color:${BRAND.ink};font-weight:600;">${input.requestSubject}</p>
  <p style="margin:0 0 8px 0;font-size:12px;color:${BRAND.inkFaint};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Our response</p>
  <p style="margin:0;font-size:14px;color:${BRAND.inkSoft};white-space:pre-wrap;">${escapeHtml(input.responseNote)}</p>
</div>
${ctaButton(input.supportUrl, 'View in support')}
`.trim();

  return {
    to:      input.to,
    subject: `Re: ${input.requestSubject}`,
    html:    wrapEmail(body, `Your account team has responded to "${input.requestSubject}".`),
    tag:     'service-request-response',
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
