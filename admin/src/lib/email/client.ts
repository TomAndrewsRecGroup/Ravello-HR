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
//   EMAIL_FROM            — From address (default: noreply@portal.thepeoplesystem.co.uk)
//                           NOTE: the FROM-ADDRESS DOMAIN must be verified in
//                           Resend → Domains. Currently the verified domain is
//                           the `portal.thepeoplesystem.co.uk` subdomain — sending
//                           from anything @ the apex thepeoplesystem.co.uk will be
//                           rejected with HTTP 403 until the apex is verified too.
//   EMAIL_REPLY_TO        — Reply-To header (default: hello@thepeoplesystem.co.uk).
//                           Reply-to does NOT need to be on a verified domain.
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
  /** ISO-8601 timestamp; Resend queues the send and dispatches at
   *  the requested time (up to 30 days in the future). */
  scheduledAt?: string;
}

export interface SendEmailResult {
  id:        string;
  /** Whether this was a real send or a no-op (no API key). */
  delivered: boolean;
}

/** Surfaced when Resend rejects a send so callers can show the operator
 *  the actual reason (unverified domain, bad from-address, rate limit etc.)
 *  instead of a generic 'rejected' string. Module-level so multiple
 *  invocations don't race.
 */
let lastSendError: { status: number; message: string; from: string } | null = null;
export function lastEmailError() { return lastSendError; }

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

  const from    = process.env.EMAIL_FROM     ?? 'The People System <noreply@portal.thepeoplesystem.co.uk>';
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
  if (input.scheduledAt) payload.scheduled_at = input.scheduledAt;

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
      let parsedMessage = errBody;
      try {
        const parsed = JSON.parse(errBody);
        parsedMessage = parsed.message ?? parsed.error ?? errBody;
      } catch { /* leave as raw text */ }
      lastSendError = { status: res.status, message: parsedMessage, from };
      console.error('[email] Resend rejected send', { status: res.status, body: errBody, subject: input.subject, from });
      return null;
    }

    lastSendError = null;
    const data = await res.json() as { id: string };
    return { id: data.id, delivered: true };
  } catch (err: any) {
    lastSendError = { status: 0, message: err?.message ?? 'Network error reaching Resend', from };
    console.error('[email] Resend transport failure', { error: err?.message, subject: input.subject });
    return null;
  }
}
