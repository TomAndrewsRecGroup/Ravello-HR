import { wrapEmail, ctaButton, BRAND } from '../layout';

// The next-step email for a job-board applicant who scored above the
// threshold for their role.
//
// WHAT THIS EMAIL IS, AND IS NOT
//
// It is the next step in an application the candidate already started:
// they answered an advertised role, we read their CV against it, and
// this hands them the online application form. Afterwards they get
// instructions for the AI interview stage.
//
// It is NOT an introduction to a third party, and the commercial
// arrangement behind it is NOT the candidate's business. Operator
// instruction, 2026-08-28: the referral programme is "not to be told to
// candidates". The internal vocabulary — referral_applications, the
// funnel, the fee statuses — is ours; none of it belongs in the copy,
// and `no_partner_or_referral_language_reaches_the_candidate` in the
// tests is what stops it drifting back in.
//
// Earlier copy did the opposite. It led with the partner's name, said
// "This role is with X, and the next step is yours to take directly
// with them", and titled the button "Complete your X application" —
// which reads as a hand-off to somebody else rather than as the next
// stage of the thing they applied for.
//
// Lawful basis: they applied to THIS role through Andrews Recruitment's
// job-board posting and Manatal stamped consent at the point of
// application. The pipeline only ever mails candidates attached to a
// referral-enabled requisition, so the email is a reply about the role
// they applied for — not a broadcast to a candidate list. That is the
// property that keeps this transactional, and it is enforced in the
// cron by walking /matches/ per role rather than the candidate table.
//
// Deliberately NOT scheduled. athleteWelcome defers +2 days to give
// Tom time to prepare; this candidate is mid-jobsearch and should hear
// back while they still remember applying.

export interface ReferralInviteInput {
  to:            string;
  /** First name for the greeting; falls back to "Hi there,". */
  firstName?:    string;
  /** The role they applied for, e.g. "AI Engineer". */
  roleTitle:     string;
  /** The online application form, with any per-candidate parameters
   *  already substituted. See lib/referral/referralUrl.ts. */
  referralUrl:   string;
  /** Optional replacement for the sentence describing what happens
   *  next. The default covers the online form and the AI interview
   *  stage that follows it. */
  processNote?:  string;
}

export function referralInviteEmail(input: ReferralInviteInput) {
  const greeting = input.firstName?.trim() ? `Hi ${input.firstName.trim()},` : 'Hi there,';

  const processNote = input.processNote?.trim()
    || 'It’s straightforward and you can complete it in your own time. Once it’s in, you’ll receive instructions for the AI interview stage.';

  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Next step in your ${input.roleTitle} application</h1>
<p style="margin:0 0 16px 0;">${greeting}</p>
<p style="margin:0 0 16px 0;">Thanks for applying for the <strong>${input.roleTitle}</strong> role through <strong>Andrews Recruitment Group</strong>. We&rsquo;ve reviewed your CV against what the role needs, and you&rsquo;ve come through as a strong match.</p>
<p style="margin:0 0 16px 0;">The next step is to complete your application online. ${processNote}</p>
${ctaButton(input.referralUrl, 'Complete your application')}
<p style="margin:24px 0 0 0;">There&rsquo;s no deadline from our side, but roles like this move quickly &mdash; worth doing while it&rsquo;s in front of you.</p>
<p style="margin:16px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">Any questions, just reply to this email and it&rsquo;ll come straight back to us.</p>
<p style="margin:16px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">Tom Andrews<br/>Andrews Recruitment Group</p>
`.trim();

  return {
    to:      input.to,
    subject: `Your ${input.roleTitle} application — next step`,
    html:    wrapEmail(
      body,
      'Complete your application online to move to the AI interview stage.',
      `You received this email because you applied for the ${input.roleTitle} role through Andrews Recruitment Group.`,
    ),
    tag:     'referral-invite',
  };
}
