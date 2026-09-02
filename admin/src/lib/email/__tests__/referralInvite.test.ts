// What the candidate is actually sent.
//
// Operator instruction, 2026-08-28: the referral programme is "not to be
// told to candidates". The internal vocabulary — referral, partner, fee,
// the funnel statuses — is ours. It is also the vocabulary every file
// around this one uses, which is exactly why a copy edit made months
// from now could put it back into the email without anybody noticing:
// the wording would read perfectly naturally to whoever wrote it.
//
// A comment cannot enforce that. This can.

import { describe, expect, it } from 'vitest';
import { referralInviteEmail } from '../templates/referralInvite';

const BASE = {
  to:          'frank.k.ayensu@gmail.com',
  firstName:   'Frank',
  roleTitle:   'Area Sales Manager',
  referralUrl: 'https://apply.example.com/roles?cid=abc-123',
};

/** Everything a candidate must never read. Subject, preheader, body and
 *  footer are all checked, because the preheader is the line that shows
 *  in the inbox list before anything is opened. */
const FORBIDDEN = [
  'referral',
  'referred',
  'referring',
  'fee',
  'commission',
  'partner',
  'micro1',
];

describe('no partner or referral language reaches the candidate', () => {
  it('says none of it, anywhere in the email', () => {
    const mail = referralInviteEmail(BASE);
    const all  = `${mail.subject}\n${mail.html}`.toLowerCase();

    for (const word of FORBIDDEN) {
      expect(all, `the candidate email contains "${word}"`).not.toContain(word);
    }
  });

  it('says none of it even when the operator overrides the process note', () => {
    // The one field an operator can type free text into. It is theirs to
    // write, so this does not police it — but the REST of the email must
    // stay clean regardless of what they put there, which is what would
    // break if the template started interpolating a partner name again.
    const mail = referralInviteEmail({ ...BASE, processNote: 'Takes about ten minutes.' });
    const all  = `${mail.subject}\n${mail.html}`.toLowerCase();
    for (const word of FORBIDDEN) {
      expect(all, `the candidate email contains "${word}"`).not.toContain(word);
    }
    expect(mail.html).toContain('Takes about ten minutes.');
  });
});

describe('the email describes the actual next step', () => {
  it('frames it as their application continuing, not a hand-off', () => {
    const mail = referralInviteEmail(BASE);
    expect(mail.subject).toBe('Your Area Sales Manager application — next step');
    expect(mail.html).toContain('Next step in your Area Sales Manager application');
    expect(mail.html).toContain('Andrews Recruitment Group');
  });

  it('tells them the AI interview stage follows', () => {
    // The operator's description of the flow: complete the application
    // online, then await instructions for the AI interview stage. A
    // candidate who is not told that has no idea what happens next.
    const mail = referralInviteEmail(BASE);
    expect(mail.html).toContain('AI interview');
  });

  it('puts the application link in the button, unaltered', () => {
    const mail = referralInviteEmail(BASE);
    expect(mail.html).toContain(`href="${BASE.referralUrl}"`);
    expect(mail.html).toContain('Complete your application');
  });

  it('greets by first name, and falls back cleanly', () => {
    expect(referralInviteEmail(BASE).html).toContain('Hi Frank,');
    expect(referralInviteEmail({ ...BASE, firstName: undefined }).html).toContain('Hi there,');
  });

  it('states why they are receiving it', () => {
    // The lawful-basis line: they applied to this role through us.
    expect(referralInviteEmail(BASE).html)
      .toContain('you applied for the Area Sales Manager role through Andrews Recruitment Group');
  });
});

/* ─── Sender identity ──────────────────────────────────────── */
//
// The candidate answered an Andrews Recruitment Group advert. Until
// 2026-09-02 the email was signed by Tom Andrews but wrapped in a shell
// headed, footed and titled The People System — so a recipient saw a
// company they had never heard of. Mismatched identity is a trust
// problem and a live spam signal.

describe('the email is branded as the company the candidate applied to', () => {
  const mail = () => referralInviteEmail({
    to: 'x@example.com', roleTitle: 'AI Engineer', referralUrl: 'https://apply.example.com',
  });

  it('names Andrews Recruitment Group in the header, footer and tab title', () => {
    const html = mail().html;
    // The <title> is the tab name and some clients show it.
    expect(html).toContain('<title>Andrews Recruitment Group</title>');
    // Header: no ARG logo is hosted on an ARG domain yet, so the name
    // renders as a wordmark. Asserting the ABSENCE of the People System
    // logo is the half that matters — an off-domain image is both wrong
    // and a deliverability demerit.
    expect(html).not.toContain('the%20people%20system');
    expect(html).not.toMatch(/alt="The People System"/);
  });

  it('carries no People System identity anywhere', () => {
    const html = mail().html;
    expect(html).not.toContain('The People System');
    expect(html).not.toContain('thepeoplesystem.co.uk');
    expect(html).not.toContain('HR consultancy');
  });

  it('points the footer link at the ARG site', () => {
    expect(mail().html).toContain('andrews-recruitment.com');
  });

  // The envelope is a separate, opt-in step: Resend 403s a from-address
  // on an unverified domain, so a hardcoded ARG sender would stop every
  // referral email until the DNS records existed.
  it('leaves `from` unset unless REFERRAL_EMAIL_FROM is configured', () => {
    const before = process.env.REFERRAL_EMAIL_FROM;
    try {
      delete process.env.REFERRAL_EMAIL_FROM;
      expect(mail().from).toBeUndefined();

      process.env.REFERRAL_EMAIL_FROM = 'ARG <careers@andrews-recruitment.com>';
      expect(mail().from).toBe('ARG <careers@andrews-recruitment.com>');
    } finally {
      if (before === undefined) delete process.env.REFERRAL_EMAIL_FROM;
      else process.env.REFERRAL_EMAIL_FROM = before;
    }
  });
});

// Guard the guard: the change above must not have rebranded every other
// email in the app. wrapEmail's default is still The People System.
describe('every other email keeps the People System shell', () => {
  it('the default wrapper is unchanged', async () => {
    const { wrapEmail } = await import('../layout');
    const html = wrapEmail('<p>hello</p>', 'preheader');
    expect(html).toContain('<title>The People System</title>');
    expect(html).toContain('thepeoplesystem.co.uk');
    expect(html).toContain('You received this email because you have an account with The People System.');
    expect(html).not.toContain('Andrews Recruitment Group');
  });
});
