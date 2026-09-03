import { describe, expect, it } from 'vitest';
import { buildAthleteWelcomeEmail, buildInviteEmail, buildPartnerReferralEmail } from '../email';

// This is the LIVE auto-send path: /api/r/athlete/[slug] fires
// buildAthleteWelcomeEmail on every real, unauthenticated athlete
// signup. Until 2026-09-03 it went out in the generic purple
// People-System shell AND its copy never named Andrews Recruitment
// Group at all -- "The People System's Athletes To Industry
// programme" -- even though the booking link is on their domain and
// the call is with their owner. The operator confirmed this is the
// same identity mismatch the referral invite had.

function mail() {
  return buildAthleteWelcomeEmail({ to: 'x@example.com', firstName: 'Sam' });
}

describe('the athlete welcome email uses the A2I identity, not the purple People-System shell', () => {
  it('carries no People System branding', () => {
    const html = mail().html;
    expect(html).not.toContain('<title>The People System</title>');
    expect(html).not.toContain('thepeoplesystem.co.uk');
    expect(html).not.toContain('HR consultancy');
  });

  it('is titled and logo-marked Athletes To Industry', () => {
    const html = mail().html;
    expect(html).toContain('<title>Athletes To Industry</title>');
    expect(html).toContain('Athletes%20To%20Industry');
  });

  it('states the correct relationship in the footer', () => {
    const html = mail().html;
    expect(html).toContain('Operated by Andrews Recruitment Group');
    expect(html).toContain('Powered by The People System');
  });

  it('names Andrews Recruitment Group in the body copy', () => {
    // The pre-fix copy dropped this entirely -- "The People System's
    // Athletes To Industry programme" -- which is the worse half of
    // this defect: not a shell mismatch, a false attribution.
    expect(mail().html).toContain("Andrews Recruitment Group's Athletes To Industry programme");
  });

  it('uses the gold CTA button, not the purple gradient one', () => {
    const html = mail().html;
    expect(html).toContain('#c9a24a'); // A2I gold
    expect(html).not.toContain('linear-gradient(135deg,#7C3AED');
  });

  it('renders on the dark navy background, not the light one', () => {
    expect(mail().html).toContain('#060a18'); // A2I navy-deep
    expect(mail().html).not.toContain('#EFF0F7'); // purple-shell bg
  });
});

// Guard the guard: this must not have rebranded the genuinely
// People-System emails, or broken the existing A2I consumer.
describe('other portal emails are unaffected', () => {
  it('the client invite email keeps the purple People-System shell', () => {
    const html = buildInviteEmail({
      to: 'x@example.com', companyName: 'Acme Ltd', roleLabel: 'Admin', activateUrl: 'https://x.example/activate',
    }).html;
    expect(html).toContain('<title>The People System</title>');
    expect(html).toContain('thepeoplesystem.co.uk');
    expect(html).not.toContain('Andrews Recruitment');
  });

  it('the partner-referral notification is unchanged', () => {
    const html = buildPartnerReferralEmail({
      to: 'tom@andrews-recruitment.com', referrerCompany: 'Acme Ltd', name: 'Jane Partner',
    }).html;
    expect(html).toContain('<title>Athletes To Industry</title>');
    expect(html).toContain('Operated by Andrews Recruitment Group');
    expect(html).toContain('New partner referral');
  });
});
