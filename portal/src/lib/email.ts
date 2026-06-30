// Minimal Resend email helper for portal API routes.
// Same approach as admin/src/lib/email — plain fetch, no SDK.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const PURPLE          = '#7C3AED';
const PURPLE_DK       = '#5A2AC8';
const INK             = '#070B1D';
const INK_SOFT        = '#38436A';
const INK_FAINT       = '#748099';
const BG              = '#EFF0F7';
const SURFACE         = '#FFFFFF';
const SURFACE_LT      = '#F4F5FB';
const LINE            = '#E2E4EE';
const LOGO_URL        = process.env.EMAIL_LOGO_URL ?? 'https://www.thepeoplesystem.co.uk/email-logo.png';

function wrapEmail(body: string, preheader: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>The People System</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BG};padding:32px 16px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:${SURFACE};border-radius:16px;overflow:hidden;border:1px solid ${LINE};">
<tr><td style="padding:32px 32px 16px 32px;border-bottom:1px solid ${LINE};"><img src="${LOGO_URL}" alt="The People System" width="180" style="display:block;height:auto;max-width:180px;"/></td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.6;color:${INK};">${body}</td></tr>
<tr><td style="padding:24px 32px;border-top:1px solid ${LINE};background:${SURFACE_LT};font-size:12px;color:${INK_FAINT};line-height:1.5;">
<p style="margin:0 0 8px 0;font-weight:600;color:${INK_SOFT};">The People System</p>
<p style="margin:0;">HR consultancy &amp; people platform.</p>
<p style="margin:8px 0 0 0;"><a href="https://www.thepeoplesystem.co.uk" style="color:${PURPLE};text-decoration:none;">thepeoplesystem.co.uk</a></p>
</td></tr></table>
<p style="margin:16px 0 0 0;font-size:11px;color:${INK_FAINT};text-align:center;">You received this email because you have an account with The People System.</p>
</td></tr></table></body></html>`;
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="border-radius:10px;background:${PURPLE};">
<a href="${href}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;background:linear-gradient(135deg,${PURPLE} 0%,${PURPLE_DK} 100%);">${label}</a>
</td></tr></table>`;
}

export function buildInviteEmail(input: {
  to:           string;
  companyName:  string;
  roleLabel:    string;
  activateUrl:  string;
}) {
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${INK};">You've been invited to The People System</h1>
<p style="margin:0 0 16px 0;"><strong>${input.companyName}</strong> has added you as an <strong>${input.roleLabel}</strong> on their People System portal.</p>
<p style="margin:0 0 16px 0;">Click the button below to set your password and access the platform. The link is valid for <strong>7 days</strong>.</p>
${ctaButton(input.activateUrl, 'Accept invitation')}
<p style="margin:24px 0 0 0;font-size:13px;color:${INK_SOFT};">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${input.activateUrl}" style="color:${PURPLE};word-break:break-all;">${input.activateUrl}</a></p>
`.trim();

  return {
    to:      input.to,
    subject: `${input.companyName} invited you to The People System`,
    html:    wrapEmail(body, `Accept your invitation to join ${input.companyName} on The People System.`),
    tag:     'user-invited',
  };
}

const ATHLETE_BOOKING_URL =
  'https://outlook.office.com/bookwithme/user/1cf5276e70ab4ff38d6148488970b02b@andrews-recruitment.com/meetingtype/2SFLXpPozUKFYId3Ba1I-g2?bookingcode=baf24931-2d13-429f-89ff-2e1696e66feb&anonymous&ismsaljsauthenabled&ep=mLinkFromTile';

export function buildAthleteWelcomeEmail(input: { to: string; firstName?: string; bookingUrl?: string }) {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi there,';
  const url = input.bookingUrl ?? ATHLETE_BOOKING_URL;
  const body = `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${INK};">Welcome to Athletes To Industry</h1>
<p style="margin:0 0 16px 0;">${greeting}</p>
<p style="margin:0 0 16px 0;">Your details have been added to <strong>The People System's Athletes To Industry programme</strong>, the start of your transition into industry. We'll work alongside you to introduce you to partner companies, training providers and the right opportunities for your next chapter.</p>
<p style="margin:0 0 16px 0;">The first step is a short, no-pressure call with <strong>Tom Andrews</strong>. He'll talk you through the programme, learn what you're looking for, and map out the support you'll get from us.</p>
${ctaButton(url, 'Book a call with Tom Andrews')}
<p style="margin:24px 0 0 0;font-size:13px;color:${INK_SOFT};">If you'd rather get in touch first, just reply to this email and we'd love to hear from you.</p>
`.trim();
  return {
    to:      input.to,
    subject: 'Your Athletes To Industry journey starts here',
    html:    wrapEmail(body, "Welcome to Athletes To Industry. Book a call with Tom Andrews to get started."),
    tag:     'athlete-welcome',
  };
}

// ── Athletes To Industry gold/navy email theme ──────────────────────────
// Distinct from the purple People-System shell above so A2I referral
// notifications stay on-brand. Used by buildPartnerReferralEmail.
const A2I_NAVY_DEEP = '#060a18';
const A2I_NAVY      = '#0a1126';
const A2I_CREAM     = '#f3ecd8';
const A2I_CREAM_MUT = '#c9c4b3';
const A2I_GOLD      = '#c9a24a';
const A2I_BORDER    = 'rgba(243,236,216,0.14)';
const A2I_LOGO_URL  =
  process.env.A2I_EMAIL_LOGO_URL ??
  'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/Athletes%20To%20Industry%20Option%20A.png';

/** Escape untrusted text before interpolating into email HTML. */
function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEmailGold(body: string, preheader: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Athletes To Industry</title></head>
<body style="margin:0;padding:0;background:${A2I_NAVY_DEEP};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${A2I_CREAM};">
<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${A2I_NAVY_DEEP};padding:32px 16px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:${A2I_NAVY};border-radius:14px;overflow:hidden;border:1px solid ${A2I_BORDER};">
<tr><td style="padding:28px 32px 18px 32px;border-bottom:1px solid ${A2I_BORDER};"><img src="${A2I_LOGO_URL}" alt="Athletes To Industry" width="64" style="display:block;height:auto;max-width:64px;"/></td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.6;color:${A2I_CREAM};">${body}</td></tr>
<tr><td style="padding:22px 32px;border-top:1px solid ${A2I_BORDER};font-size:12px;color:${A2I_CREAM_MUT};line-height:1.5;">
<p style="margin:0 0 6px 0;font-weight:600;color:${A2I_GOLD};letter-spacing:0.06em;text-transform:uppercase;">Athletes To Industry</p>
<p style="margin:0;">Operated by Andrews Recruitment Group · Powered by The People System.</p>
</td></tr></table>
</td></tr></table></body></html>`;
}

/** Notification to Tom when a partner submits via a client's /r/partner/[slug] link. */
export function buildPartnerReferralEmail(input: {
  to:              string;
  referrerCompany: string;
  name:            string;
  location?:       string | null;
  website?:        string | null;
  sector?:         string | null;
  opportunities?:  string | null;
}) {
  const row = (label: string, value: string) => `
<tr>
<td style="padding:10px 0;border-bottom:1px solid ${A2I_BORDER};font-size:12px;color:${A2I_GOLD};text-transform:uppercase;letter-spacing:0.08em;width:160px;vertical-align:top;">${label}</td>
<td style="padding:10px 0;border-bottom:1px solid ${A2I_BORDER};font-size:14px;color:${A2I_CREAM};">${value}</td>
</tr>`;

  const websiteVal = input.website
    ? `<a href="${escapeHtml(input.website)}" style="color:${A2I_GOLD};">${escapeHtml(input.website)}</a>`
    : 'Not provided';
  const opportunities = escapeHtml(input.opportunities).replace(/\n/g, '<br/>') || 'Not provided';

  const body = `
<h1 style="margin:0 0 8px 0;font-size:21px;font-weight:700;color:${A2I_CREAM};">New partner referral</h1>
<p style="margin:0 0 20px 0;color:${A2I_CREAM_MUT};">Referred by <strong style="color:${A2I_CREAM};">${escapeHtml(input.referrerCompany)}</strong> via their Athletes To Industry partner link.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${row('Partner / name', escapeHtml(input.name) || 'Not provided')}
${row('Location', escapeHtml(input.location) || 'Not provided')}
${row('Website', websiteVal)}
${row('Sector', escapeHtml(input.sector) || 'Not provided')}
</table>
<p style="margin:22px 0 6px 0;font-size:12px;color:${A2I_GOLD};text-transform:uppercase;letter-spacing:0.08em;">Opportunities available</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:${A2I_CREAM};">${opportunities}</p>
`.trim();

  return {
    to:      input.to,
    subject: `New partner referral via ${input.referrerCompany}: ${input.name}`,
    html:    wrapEmailGold(body, `New Athletes To Industry partner referral from ${input.referrerCompany}.`),
    tag:     'partner-referral',
  };
}

/** Returns ISO-8601 for +2 days from `from`, snapped into the
 *  09:00–17:00 GMT window. */
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

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Mirror of admin/src/lib/email/client.ts: callers can read this to
// surface the actual Resend error string to the operator instead of
// printing 'rejected' and forcing a Vercel-logs dive. Module-level
// so concurrent invocations don't race.
let lastSendError: { status: number; message: string; from: string } | null = null;
export function lastEmailError() { return lastSendError; }

export async function sendEmail(input: {
  to: string; subject: string; html: string; tag?: string;
  /** ISO-8601 — passed to Resend as scheduled_at. */
  scheduledAt?: string;
}): Promise<{ id: string; delivered: true } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY unset — skipping send', { subject: input.subject });
    return null;
  }

  const from    = process.env.EMAIL_FROM     ?? 'The People System <noreply@portal.thepeoplesystem.co.uk>';
  const replyTo = process.env.EMAIL_REPLY_TO ?? 'hello@thepeoplesystem.co.uk';
  const bcc     = process.env.EMAIL_BCC_INTERNAL?.split(',').map(s => s.trim()).filter(Boolean) ?? [];

  const payload: Record<string, unknown> = {
    from,
    to:       [input.to],
    subject:  input.subject,
    html:     input.html,
    text:     htmlToText(input.html),
    reply_to: replyTo,
  };
  if (bcc.length)  payload.bcc  = bcc;
  if (input.tag)   payload.tags = [{ name: 'category', value: input.tag }];
  if (input.scheduledAt) payload.scheduled_at = input.scheduledAt;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      let parsed = errBody;
      try {
        const j = JSON.parse(errBody);
        parsed = j.message ?? j.error ?? errBody;
      } catch { /* leave raw */ }
      lastSendError = { status: res.status, message: parsed, from };
      console.error('[email] Resend rejected send', { status: res.status, body: errBody, from });
      return null;
    }
    lastSendError = null;
    const data = await res.json() as { id: string };
    return { id: data.id, delivered: true };
  } catch (err: any) {
    lastSendError = { status: 0, message: err?.message ?? 'Network error', from };
    console.error('[email] Resend transport failure', err?.message);
    return null;
  }
}
