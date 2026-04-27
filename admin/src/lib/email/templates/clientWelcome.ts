import { wrapEmail, ctaButton, BRAND } from '../layout';

export interface ClientWelcomeInput {
  /** Recipient email address. */
  to:           string;
  companyName:  string;
  /** Optional first name for the greeting. Falls back to "Hello,". */
  firstName?:   string;
  /** URL to the portal sign-in page. */
  portalUrl:    string;
  /** Whether the company has paid modules enabled (controls onboarding-wizard mention). */
  hasPaidModules: boolean;
}

export function clientWelcomeEmail(input: ClientWelcomeInput) {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hello,';

  const onboardingNote = input.hasPaidModules
    ? `<p style="margin:0 0 16px 0;">When you sign in for the first time, we'll walk you through a short onboarding wizard so we can tailor the platform to your business. It takes about 5 minutes.</p>`
    : `<p style="margin:0 0 16px 0;">Your account is ready — sign in any time to get started.</p>`;

  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Welcome to The People System</h1>
<p style="margin:0 0 16px 0;">${greeting}</p>
<p style="margin:0 0 16px 0;">Your account for <strong>${input.companyName}</strong> is now active. We're delighted to have you on board.</p>
${onboardingNote}
${ctaButton(input.portalUrl, 'Sign in to your portal')}
<p style="margin:24px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">If you have any questions, just reply to this email and a member of our team will get back to you.</p>
`.trim();

  return {
    to:      input.to,
    subject: `Welcome to The People System, ${input.companyName}`,
    html:    wrapEmail(body, `Your account for ${input.companyName} is ready — sign in to get started.`),
    tag:     'client-welcome',
  };
}
