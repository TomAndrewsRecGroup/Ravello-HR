import { wrapEmail, ctaButton, BRAND } from '../layout';

// Sent to a user of an external Health & Safety provider (a consultancy
// such as Lighthouse Safety, a training company such as Kentec) when
// Core OS 360 staff give them a login. The link goes to the shared
// set-password page; after it, they sign in to the admin app's /hs
// workspace.

export interface HsProviderInvitedInput {
  to:           string;
  providerName: string;
  /** The /auth/set-password?token=UUID link — valid for 7 days. */
  acceptUrl:    string;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function hsProviderInvitedEmail(input: HsProviderInvitedInput) {
  const provider = escape(input.providerName);
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Your Core OS 360 login</h1>
<p style="margin:0 0 16px 0;">Core OS 360 has given you a login as <strong>${provider}</strong>, so you can record Health &amp; Safety work for the clients you look after: register items, completions, visits and evidence. Each client sees what you record on their Safety Timeline.</p>
<p style="margin:0 0 16px 0;">Click the button below to <strong>set your password</strong>. The link is valid for <strong>7 days</strong>.</p>
${ctaButton(input.acceptUrl, 'Set your password')}
<p style="margin:24px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${input.acceptUrl}" style="color:${BRAND.purple};word-break:break-all;">${input.acceptUrl}</a></p>
`.trim();

  return {
    to:      input.to,
    subject: `Your Core OS 360 login for ${input.providerName}`,
    html:    wrapEmail(body, `Set your password to record Health & Safety work as ${input.providerName}.`),
    tag:     'hs-provider-invited',
  };
}
