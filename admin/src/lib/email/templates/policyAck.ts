import { wrapEmail, ctaButton, infoCard, BRAND } from '../layout';

// To the employee (no login; reached by email): a personal link to read
// and acknowledge a policy. Filled from the rows; the link carries the
// token whose hash is in policy_ack_tokens (103).

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface PolicyAckRequestInput {
  employeeName: string;
  companyName: string;
  documentName: string;
  documentCategory: string;
  link: string;
  expiresAt: string;
  reminder: boolean;
}

export function policyAckRequestEmail(i: PolicyAckRequestInput) {
  const first = esc(i.employeeName.split(' ')[0] || i.employeeName);
  const company = esc(i.companyName || 'Your employer');
  const expires = new Date(i.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">${i.reminder ? 'Reminder: a policy is waiting for your sign-off' : 'Please read and acknowledge a policy'}</h1>
<p style="margin:0 0 16px 0;">Hi ${first}, ${company} has asked you to read <strong>${esc(i.documentName)}</strong> and confirm you have understood it. It takes a minute: open the link, read the document, press acknowledge.</p>
${infoCard([
    { label: 'Document', value: esc(i.documentName) },
    { label: 'Type',     value: esc(i.documentCategory.replace(/_/g, ' ')) },
    { label: 'From',     value: company },
  ])}
${ctaButton(i.link, 'Read and acknowledge')}
<p style="margin:16px 0 0 0;font-size:13px;color:${BRAND.inkFaint};">This link is personal to you and works until ${esc(expires)}. If it has expired, ask ${company} to send a new one. No account or password is needed.</p>
`.trim();
  return {
    subject: `${i.reminder ? 'Reminder: ' : ''}Please acknowledge: ${i.documentName}`,
    html: wrapEmail(body, `${i.companyName || 'Your employer'} asks you to read and acknowledge ${i.documentName}.`),
    tag: i.reminder ? 'policy-ack-reminder' : 'policy-ack-request',
  };
}
