// Email module entry point. Import templates + sender from here.
//
//   import { sendEmail, clientWelcomeEmail } from '@/lib/email';
//
//   await sendEmail(clientWelcomeEmail({ to, companyName, portalUrl, ... }));
//
// All templates return a { to, subject, html, tag } object that
// sendEmail() accepts directly. Failure modes are logged and never
// thrown — the caller's primary action always proceeds.

export { sendEmail, lastEmailError }          from './client';
export type { SendEmailInput, SendEmailResult } from './client';
export { wrapEmail, ctaButton, infoCard, BRAND } from './layout';

export { clientWelcomeEmail }            from './templates/clientWelcome';
export type { ClientWelcomeInput }       from './templates/clientWelcome';

export { userInvitedEmail }              from './templates/userInvited';
export type { UserInvitedInput }         from './templates/userInvited';

export { passwordResetEmail }            from './templates/passwordReset';
export type { PasswordResetInput }       from './templates/passwordReset';

export { actionAssignedEmail }           from './templates/actionAssigned';
export type { ActionAssignedInput }      from './templates/actionAssigned';

export { billingSetupEmail }             from './templates/billingSetup';
export type { BillingSetupInput }        from './templates/billingSetup';

export { serviceRequestResponseEmail }   from './templates/serviceRequestResponse';
export type { ServiceRequestResponseInput } from './templates/serviceRequestResponse';

export { athleteWelcomeEmail, nextBusinessSendAt } from './templates/athleteWelcome';
export type { AthleteWelcomeInput } from './templates/athleteWelcome';
