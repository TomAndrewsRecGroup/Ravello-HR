import { wrapEmail, ctaButton, BRAND } from '../layout';

// The referral invitation.
//
// Sent to a job-board applicant who cleared the country gate, every
// mandatory criterion, and the match threshold for a referral-enabled
// role. It hands them the partner's application link.
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
// Tom time to prepare; a referral candidate is mid-jobsearch and
// should hear back while they still remember applying.

export interface ReferralInviteInput {
  to:            string;
  /** First name for the greeting; falls back to "Hi there,". */
  firstName?:    string;
  /** The role they applied for, e.g. "AI Engineer". */
  roleTitle:     string;
  /** Who the referral is to, e.g. "Micro1". */
  partnerName:   string;
  /** The partner's static application link. */
  referralUrl:   string;
  /** Optional one-line description of the partner's process, if the
   *  default doesn't fit a future partner. */
  processNote?:  string;
}

export function referralInviteEmail(input: ReferralInviteInput) {
  const greeting = input.firstName?.trim() ? `Hi ${input.firstName.trim()},` : 'Hi there,';
  const partner  = input.partnerName;

  const processNote = input.processNote?.trim()
    || `${partner} run their own application and AI interview process. It's straightforward, you complete it in your own time, and it's how they assess technical candidates.`;

  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">You look like a strong fit for ${partner}</h1>
<p style="margin:0 0 16px 0;">${greeting}</p>
<p style="margin:0 0 16px 0;">Thanks for applying for the <strong>${input.roleTitle}</strong> role through <strong>Andrews Recruitment Group</strong>. We've reviewed your CV against what's needed, and you've come through as potentially well suited.</p>
<p style="margin:0 0 16px 0;">This role is with <strong>${partner}</strong>, and the next step is yours to take directly with them. ${processNote}</p>
${ctaButton(input.referralUrl, `Complete your ${partner} application`)}
<p style="margin:24px 0 0 0;">There's no deadline from our side, but roles like this move quickly — worth doing while it's in front of you.</p>
<p style="margin:16px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">Any questions, just reply to this email and it'll come straight back to us.</p>
<p style="margin:16px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">Tom Andrews<br/>Andrews Recruitment Group</p>
`.trim();

  return {
    to:      input.to,
    subject: `Your ${input.roleTitle} application — next step with ${partner}`,
    html:    wrapEmail(
      body,
      `You've been selected as potentially suitable for ${partner} — here's how to apply.`,
      `You received this email because you applied for the ${input.roleTitle} role through Andrews Recruitment Group.`,
    ),
    tag:     'referral-invite',
  };
}
