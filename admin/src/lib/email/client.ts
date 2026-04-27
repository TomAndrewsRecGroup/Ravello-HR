// Resend HTTP client.
//
// Uses the Resend REST API directly (no SDK dep) — emails are simple
// POSTs with a JSON body, the SDK adds nothing we need.
//
// Configuration via env vars (set on Vercel for both projects):
//   RESEND_API_KEY        — Required to actually send. If unset, send()
//                           logs a warning and returns null (so dev /
//                           preview environments don't crash on email
//                           triggers).
//   EMAIL_FROM            — From address (default: noreply@thepeoplesystem.co.uk)
//   EMAIL_REPLY_TO        — Reply-To header (default: hello@thepeoplesystem.co.uk)
//   EMAIL_BCC_INTERNAL    — Optional comma-separated list — every send
//                           gets BCC'd here (useful for dev visibility).
//
// Idempotency / retries: Resend handles delivery retries server-side.
// We do not retry transport errors here — failing a network call should
// fall through to the API route handler which already logs and returns
// 200 to the client (the email is best-effort, never blocks the user).

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendEmailInput {
  to:       string | string[];
  subject:  string;
  html:     string;
  /** Optional plaintext fallback. Auto-generated from html if omitted. */
  text?:    string;
  replyTo?: string;
  /** Tag for Resend Insights filtering, e.g. "client-welcome". */
  tag?:     string;
}

export interface SendEmailResult {
  id:       string;
  /** Whether this was a real send or a no-op (no API key). */
  delivered: boolean;
}

/**
 * Strip tags and decode common entities for plaintext fallback.
 * Good enough for transactional email — not a full HTML-to-text engine.
 */
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

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY unset — skipping send', { subject: input.subject, to: input.to });
    return null;
  }

  const from    = process.env.EMAIL_FROM     ?? 'The People System <noreply@thepeoplesystem.co.uk>';
  const replyTo = input.replyTo ?? process.env.EMAIL_REPLY_TO ?? 'hello@thepeoplesystem.co.uk';
  const bcc     = process.env.EMAIL_BCC_INTERNAL?.split(',').map(s => s.trim()).filter(Boolean) ?? [];

  const payload: Record<string, unknown> = {
    from,
    to:       Array.isArray(input.to) ? input.to : [input.to],
    subject:  input.subject,
    html:     input.html,
    text:     input.text ?? htmlToText(input.html),
    reply_to: replyTo,
  };
  if (bcc.length) payload.bcc = bcc;
  if (input.tag)  payload.tags = [{ name: 'category', value: input.tag }];

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method:  'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[email] Resend rejected send', { status: res.status, body: errBody, subject: input.subject });
      return null;
    }

    const data = await res.json() as { id: string };
    return { id: data.id, delivered: true };
  } catch (err: any) {
    // Network error — log and move on. The API route still returns 200
    // because the user's primary action succeeded; email is a side-effect.
    console.error('[email] Resend transport failure', { error: err?.message, subject: input.subject });
    return null;
  }
}
