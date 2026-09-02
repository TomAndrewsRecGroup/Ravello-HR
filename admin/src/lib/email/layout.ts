// Branded HTML shell for transactional emails.
//
// Built as inline-styled HTML strings — every email client renders
// inline styles consistently, while <style> blocks and external CSS
// are stripped or sandboxed (Outlook, Gmail mobile, etc.).
//
// Brand tokens are duplicated here from globals.css because email
// has no CSS variables — every colour must be a literal hex.
//
// Deliverability note: the logo MUST be hosted on the same root domain
// as the sending address (Resend's deliverability check flags any
// off-domain image link). Default points to thepeoplesystem.co.uk;
// override via EMAIL_LOGO_URL env var if you host it elsewhere on the
// same root (e.g. assets.thepeoplesystem.co.uk).

export const BRAND = {
  logoUrl:   process.env.EMAIL_LOGO_URL ?? 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png',
  purple:    '#7C3AED',
  purpleDk:  '#5A2AC8',
  ink:       '#070B1D',
  inkSoft:   '#38436A',
  inkFaint:  '#748099',
  surface:   '#FFFFFF',
  surfaceLt: '#F4F5FB',
  bg:        '#EFF0F7',
  line:      '#E2E4EE',
  websiteUrl: 'https://www.thepeoplesystem.co.uk',
};

/* ─── Who the email is FROM, visually ──────────────────────── */

/**
 * Not every email this app sends comes from The People System.
 *
 * The referral invite is signed "Tom Andrews, Andrews Recruitment
 * Group" and answers an advert the candidate saw under that name — but
 * it went out inside a shell headed, footed and titled The People
 * System. A recipient who applied to an ARG job board ad received mail
 * that looked like it came from a company they had never heard of.
 * That is a trust problem before it is a design one, and mismatched
 * identity is a live spam signal.
 *
 * So the shell takes an identity. `TPS` is the default and every
 * existing caller keeps exactly the shell it had.
 */
export interface SenderIdentity {
  /** Company name, in the header, the footer and the <title>. */
  name:         string;
  /** One line under the name in the footer. */
  tagline:      string;
  websiteUrl:   string;
  websiteLabel: string;
  /** Null renders the NAME as text instead.
   *
   *  Deliberately nullable. Resend's deliverability check flags a logo
   *  hosted off the sending root domain, so the People System blob on
   *  an ARG email would be both wrong and a demerit. A wordmark in the
   *  brand's own type is the honest fallback until somebody hosts an
   *  ARG logo on an ARG domain. */
  logoUrl:      string | null;
  /** Reason-for-receipt line under the card, when the caller does not
   *  pass its own `footerNote`. */
  defaultFooterNote: string;
}

export const TPS_SENDER: SenderIdentity = {
  name:         'The People System',
  tagline:      'HR consultancy &amp; people platform.',
  websiteUrl:   BRAND.websiteUrl,
  websiteLabel: 'thepeoplesystem.co.uk',
  logoUrl:      BRAND.logoUrl,
  defaultFooterNote: 'You received this email because you have an account with The People System.',
};

export const ARG_SENDER: SenderIdentity = {
  name:         'Andrews Recruitment Group',
  tagline:      'Recruitment for engineering, construction and technology.',
  websiteUrl:   process.env.ARG_WEBSITE_URL ?? 'https://www.andrews-recruitment.com',
  websiteLabel: 'andrews-recruitment.com',
  // Set ARG_EMAIL_LOGO_URL once a logo is hosted on an ARG domain.
  // Until then the name renders as text — see the field's note.
  logoUrl:      process.env.ARG_EMAIL_LOGO_URL ?? null,
  defaultFooterNote: 'You received this email because you applied for a role through Andrews Recruitment Group.',
};

/**
 * Wrap body content in the branded email shell. Body should be valid
 * HTML containing one or more block-level elements with inline styles.
 *
 * preheader text shows in inbox previews ("from / subject / preheader…")
 * so it's worth setting per-email — it's the second-most important
 * marketing surface after the subject line.
 *
 * footerNote overrides the "you have an account with us" line. Set it
 * whenever that sentence would be untrue of the recipient — a job
 * applicant has no account, and an inaccurate reason-for-receipt line
 * is both a deliverability signal and simply wrong.
 */
export function wrapEmail(
  body: string,
  preheader?: string,
  footerNote?: string,
  sender: SenderIdentity = TPS_SENDER,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${sender.name}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${preheader}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:${BRAND.surface};border-radius:16px;overflow:hidden;border:1px solid ${BRAND.line};">
        <!-- Header -->
        <tr>
          <td style="padding:32px 32px 16px 32px;border-bottom:1px solid ${BRAND.line};">
            ${sender.logoUrl
              ? `<img src="${sender.logoUrl}" alt="${sender.name}" width="180" style="display:block;height:auto;max-width:180px;" />`
              : `<p style="margin:0;font-size:19px;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};">${sender.name}</p>`}
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;font-size:15px;line-height:1.6;color:${BRAND.ink};">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px;border-top:1px solid ${BRAND.line};background:${BRAND.surfaceLt};font-size:12px;color:${BRAND.inkFaint};line-height:1.5;">
            <p style="margin:0 0 8px 0;font-weight:600;color:${BRAND.inkSoft};">${sender.name}</p>
            <p style="margin:0;">${sender.tagline}</p>
            <p style="margin:8px 0 0 0;"><a href="${sender.websiteUrl}" style="color:${BRAND.purple};text-decoration:none;">${sender.websiteLabel}</a></p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0 0;font-size:11px;color:${BRAND.inkFaint};text-align:center;">
        ${footerNote ?? sender.defaultFooterNote}
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Standardised purple gradient CTA button. Pass href + label.
 * Renders as an HTML table for Outlook compatibility (Outlook ignores
 * border-radius on <a> but respects it on <td>).
 */
export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:10px;background:${BRAND.purple};">
      <a href="${href}"
         style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;background:linear-gradient(135deg,${BRAND.purple} 0%,${BRAND.purpleDk} 100%);">
         ${label}
      </a>
    </td>
  </tr>
</table>`;
}

/** Subtle info card for highlighting key details (dates, IDs, amounts). */
export function infoCard(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border:1px solid ${BRAND.line};border-radius:10px;background:${BRAND.surfaceLt};">
${rows.map(r => `
  <tr>
    <td style="padding:10px 14px;font-size:12px;color:${BRAND.inkFaint};border-bottom:1px solid ${BRAND.line};width:35%;">${r.label}</td>
    <td style="padding:10px 14px;font-size:13px;color:${BRAND.ink};border-bottom:1px solid ${BRAND.line};font-weight:500;">${r.value}</td>
  </tr>`).join('')}
</table>`.replace(/border-bottom:1px solid #E2E4EE;(\s*)<\/td>(\s*)<\/tr>(\s*)<\/table>/g, '$2</td>$3</tr>$4</table>');
}
