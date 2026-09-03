import { describe, expect, it } from 'vitest';
import { athleteWelcomeEmail } from '../templates/athleteWelcome';

// The athlete welcome email is signed by Tom Andrews and describes
// Andrews Recruitment Group's Athletes To Industry programme. Until
// 2026-09-03 it shipped in the generic purple People-System shell —
// the identical defect the referral invite had, confirmed by the
// operator: "we are using the same email format and address that we
// use for sending emails to Athletes in the Athletes to Industry
// section." It now uses Athletes To Industry's own dark navy/gold
// identity (`wrapEmailA2I`), the same one already used for the
// internal partner-referral notification.

function mail() {
  return athleteWelcomeEmail({ to: 'x@example.com', firstName: 'Sam' });
}

describe('the athlete welcome email uses the A2I identity, not the purple TPS shell', () => {
  it('carries no People System branding', () => {
    const html = mail().html;
    expect(html).not.toContain('<title>The People System</title>');
    expect(html).not.toContain('thepeoplesystem.co.uk');
    expect(html).not.toContain('HR consultancy');
    expect(html).not.toContain('the%20people%20system');
  });

  it('is titled and logo-marked Athletes To Industry', () => {
    const html = mail().html;
    expect(html).toContain('<title>Athletes To Industry</title>');
    expect(html).toContain('Athletes%20To%20Industry');
  });

  it('states the correct relationship in the footer', () => {
    expect(mail().html).toContain('Operated by Andrews Recruitment Group');
    expect(mail().html).toContain('Powered by The People System');
  });

  it('names Andrews Recruitment Group in the body copy', () => {
    expect(mail().html).toContain("Andrews Recruitment Group's Athletes To Industry programme");
  });

  it('uses the gold CTA button, not the purple gradient one', () => {
    const html = mail().html;
    expect(html).toContain('#c9a24a'); // A2I.gold
    expect(html).not.toContain('linear-gradient(135deg,#7C3AED'); // purple ctaButton
  });
});

// Guard the guard: this must not have quietly changed the OTHER
// A2I-shaped consumer, or the shared A2I palette itself.
describe('the A2I shell stays internally consistent', () => {
  it('renders on the dark navy background, not the light TPS one', () => {
    expect(mail().html).toContain('#060a18'); // A2I.navyDeep
    expect(mail().html).not.toContain('#EFF0F7'); // BRAND.bg
  });
});
