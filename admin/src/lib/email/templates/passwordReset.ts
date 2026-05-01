import { wrapEmail, ctaButton, BRAND } from '../layout';

export interface PasswordResetInput {
  to:           string;
  /** Display name shown in the greeting; falls back to "there". */
  fullName?:    string | null;
  /** The Supabase recovery link generated server-side. */
  resetUrl:     string;
}

export function passwordResetEmail(input: PasswordResetInput) {
  const first = (input.fullName ?? '').split(/\s+/)[0] || 'there';

  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Reset your password</h1>
<p style="margin:0 0 16px 0;">Hi ${first},</p>
<p style="margin:0 0 16px 0;">A password reset has been requested for your People System account. Click the button below to set a new password. The link is valid for <strong>1 hour</strong>.</p>
${ctaButton(input.resetUrl, 'Reset password')}
<p style="margin:24px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">If you didn't request this, you can ignore this email and your password will stay the same.</p>
<p style="margin:16px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">If the button doesn't work, copy this link into your browser:<br/><a href="${input.resetUrl}" style="color:${BRAND.purple};word-break:break-all;">${input.resetUrl}</a></p>
`.trim();

  return {
    to:      input.to,
    subject: 'Reset your People System password',
    html:    wrapEmail(body, `Reset your People System password.`),
    tag:     'password-reset',
  };
}
