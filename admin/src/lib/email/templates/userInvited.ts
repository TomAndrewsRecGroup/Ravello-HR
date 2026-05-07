import { wrapEmail, ctaButton, BRAND } from '../layout';

export interface UserInvitedInput {
  to:           string;
  inviterName?: string;
  companyName:  string;
  /** Branded label for the role: "Admin" or "Editor". */
  roleLabel:    string;
  /** The /auth/set-password?token=UUID link — valid for 7 days. */
  acceptUrl:    string;
}

export function userInvitedEmail(input: UserInvitedInput) {
  const inviter = input.inviterName ? `${input.inviterName} from ` : '';

  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">You've been invited to The People System</h1>
<p style="margin:0 0 16px 0;">${inviter}<strong>${input.companyName}</strong> has added you as an <strong>${input.roleLabel}</strong> on their People System portal.</p>
<p style="margin:0 0 16px 0;">You don't have a password yet. Click the button below to <strong>set your password</strong> and sign in. The link is valid for <strong>7 days</strong>.</p>
${ctaButton(input.acceptUrl, 'Set your password')}
<p style="margin:24px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${input.acceptUrl}" style="color:${BRAND.purple};word-break:break-all;">${input.acceptUrl}</a></p>
`.trim();

  return {
    to:      input.to,
    subject: `${input.companyName} invited you to The People System — set your password`,
    html:    wrapEmail(body, `Set your password to access ${input.companyName} on The People System.`),
    tag:     'user-invited',
  };
}
