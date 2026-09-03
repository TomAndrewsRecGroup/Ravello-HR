import { wrapEmail, ctaButton, ARG_SENDER, BRAND } from '../layout';

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

/** The bare address inside REFERRAL_EMAIL_FROM, e.g.
 *  "Andrews Recruitment Group <careers@andrews-recruitment.com>" -> the
 *  "careers@..." part. Resend's reply_to accepts a display-name form
 *  too, but a bare address is universally safe, and this mirrors the
 *  same extraction admin/src/app/api/admin/send-email/route.ts already
 *  does against EMAIL_FROM. Returns undefined when REFERRAL_EMAIL_FROM
 *  is unset (still the common case), which lets replyTo fall through to
 *  sendEmail's own EMAIL_REPLY_TO default — unchanged behaviour. */
function referralFromAddress(): string | undefined {
  const raw = process.env.REFERRAL_EMAIL_FROM;
  if (!raw) return undefined;
  return raw.match(/<([^>]+)>/)?.[1] ?? raw.trim();
}

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
    // FROM is opt-in and defaults to undefined, which makes sendEmail
    // fall back to EMAIL_FROM exactly as before.
    //
    // Resend rejects a from-address on an unverified domain with a 403,
    // so hardcoding an ARG address here would stop every referral email
    // dead until somebody added the DNS records. The visual identity
    // (header, footer, tab title) is fixed regardless; aligning the
    // envelope is a separate step gated on ARG's domain being verified
    // in Resend → Domains. Set REFERRAL_EMAIL_FROM then, e.g.
    //   "Andrews Recruitment Group <careers@andrews-recruitment.com>"
    //
    // Declared HERE rather than at the call sites so the preview and
    // the live send cannot disagree about who the email is from.
    from:    process.env.REFERRAL_EMAIL_FROM,
    // The body says "just reply to this email and it'll come straight
    // back to us" — so Reply-To has to land somewhere ARG actually
    // reads. sendEmail's own default is EMAIL_REPLY_TO
    // (hello@thepeoplesystem.co.uk), which is correct for every OTHER
    // email but is exactly the mismatch this file exists to fix: a
    // candidate hitting reply on an ARG-branded email would land in
    // the People System inbox. Default it to the bare address inside
    // REFERRAL_EMAIL_FROM so the two travel together — set one env var,
    // not two — with REFERRAL_EMAIL_REPLY_TO as an escape hatch for the
    // rare case they should differ (e.g. a monitored shared inbox that
    // isn't the sending address).
    replyTo: process.env.REFERRAL_EMAIL_REPLY_TO ?? referralFromAddress(),
    subject: `Your ${input.roleTitle} application — next step`,
    // ARG_SENDER, not the default. The candidate answered an Andrews
    // Recruitment Group advert and this email is signed by Tom Andrews;
    // wrapping it in a People System shell showed them a company they
    // had never heard of in the header, the footer and the tab title.
    // See SenderIdentity in ../layout.
    html:    wrapEmail(
      body,
      'Complete your application online to move to the AI interview stage.',
      `You received this email because you applied for the ${input.roleTitle} role through Andrews Recruitment Group.`,
      ARG_SENDER,
    ),
    tag:     'referral-invite',
  };
}
