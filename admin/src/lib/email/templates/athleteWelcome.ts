import { wrapEmail, ctaButton, BRAND } from '../layout';

const DEFAULT_BOOKING_URL =
  'https://outlook.office.com/bookwithme/user/1cf5276e70ab4ff38d6148488970b02b@andrews-recruitment.com/meetingtype/2SFLXpPozUKFYId3Ba1I-g2?bookingcode=baf24931-2d13-429f-89ff-2e1696e66feb&anonymous&ismsaljsauthenabled&ep=mLinkFromTile';

export interface AthleteWelcomeInput {
  to:           string;
  /** Optional first name for the greeting; falls back to "Hi there,". */
  firstName?:   string;
  /** Override the booking URL (defaults to Tom Andrews' Bookings page). */
  bookingUrl?:  string;
}

export function athleteWelcomeEmail(input: AthleteWelcomeInput) {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi there,';
  const url = input.bookingUrl ?? DEFAULT_BOOKING_URL;

  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">Welcome to Athletes To Industry</h1>
<p style="margin:0 0 16px 0;">${greeting}</p>
<p style="margin:0 0 16px 0;">Your details have been added to <strong>Andrews Recruitment Groups: Athletes To Industry programme</strong> via The People System portal. This is the start of your transition into industry. We'll work alongside you to introduce you to partner companies, training providers and the right opportunities for your next chapter.</p>
<p style="margin:0 0 16px 0;">The first step is a short, no-pressure call with <strong>Tom Andrews</strong>, Owner of Andrews Recruitment. He'll talk you through the programme, learn what you're looking for, and map out the support you'll get from us.</p>
${ctaButton(url, 'Book a call with Tom Andrews')}
<p style="margin:24px 0 0 0;font-size:13px;color:${BRAND.inkSoft};">If you'd rather get in touch first, just reply to this email — we'd love to hear from you.</p>
`.trim();

  return {
    to:      input.to,
    subject: 'Your Athletes To Industry journey starts here',
    html:    wrapEmail(body, "Welcome to Athletes To Industry - book a call with Tom to get started."),
    tag:     'athlete-welcome',
  };
}

/** Returns the ISO-8601 timestamp for a 9am-5pm GMT window, two days
 *  after the supplied date. If +2 days lands before 09:00 GMT, it
 *  snaps to 09:00 the same day; if at/after 17:00 GMT, it snaps to
 *  09:00 the following day. The Resend send queue then handles
 *  delivery at the resulting time. */
export function nextBusinessSendAt(from: Date = new Date()): string {
  const target = new Date(from.getTime() + 2 * 86_400_000);
  const h = target.getUTCHours();
  if (h < 9) {
    target.setUTCHours(9, 0, 0, 0);
  } else if (h >= 17) {
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(9, 0, 0, 0);
  }
  return target.toISOString();
}
