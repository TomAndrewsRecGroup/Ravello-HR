import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import nodemailer from 'nodemailer';

// ─── Per-staff SMTP transport ──────────────────────────────────────────
// Companion to lib/email/client.ts (Resend). Used when a TPS staff
// member has configured their own SMTP in /settings/email so outbound
// admin emails (Dev Plans, custom messages, candidate shares) leave
// from their actual address with their own signature appended.
//
// Resend remains the system default for unconfigured staff and for
// templated transactional emails (welcome / invite / etc.).

const ALGO     = 'aes-256-gcm';
const KEY_ENV  = 'SMTP_PASS_ENCRYPTION_KEY';

/** Derives a 32-byte AES key from the env master key (any length). */
function getMasterKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} env var is not set — cannot en/decrypt SMTP passwords.`);
  }
  return createHash('sha256').update(raw).digest();
}

/** Encrypt a plaintext SMTP password for storage on profiles.smtp_pass_enc.
 *  Output format: base64(iv | authTag | ciphertext). */
export function encryptSmtpPassword(plaintext: string): string {
  const key = getMasterKey();
  const iv  = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Inverse of encryptSmtpPassword. Throws on tamper / wrong key. */
export function decryptSmtpPassword(blob: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(blob, 'base64');
  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct  = buf.subarray(28);
  const dec = createDecipheriv(ALGO, key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]).toString('utf8');
}

export interface SmtpCreds {
  host:       string;
  port:       number;
  secure:     boolean;
  user:       string;
  pass:       string;          // already decrypted
  fromName?:  string | null;
  fromEmail:  string;
  replyTo?:   string | null;
}

export interface SmtpSendInput {
  to:        string;
  subject:   string;
  html:      string;
  text?:     string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  signatureHtml?: string;
}

export interface SmtpSendResult {
  messageId: string;
  delivered: true;
}

let _lastSmtpError: { message: string; from: string } | null = null;
export function lastSmtpError() { return _lastSmtpError; }

/** Best-effort plain-text fallback from HTML — matches the helper in
 *  lib/email/client.ts so the two transports produce similar output. */
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

function buildFrom(creds: SmtpCreds): string {
  return creds.fromName ? `${creds.fromName} <${creds.fromEmail}>` : creds.fromEmail;
}

/** Send via a TPS staff member's SMTP server. Signature is appended
 *  to the body when provided. Failure mode: null + lastSmtpError(). */
export async function sendViaSmtp(creds: SmtpCreds, input: SmtpSendInput): Promise<SmtpSendResult | null> {
  const transporter = nodemailer.createTransport({
    host:   creds.host,
    port:   creds.port,
    secure: creds.secure,
    auth:   { user: creds.user, pass: creds.pass },
  });

  const signed = input.signatureHtml
    ? `${input.html}<br/><br/>${input.signatureHtml}`
    : input.html;

  try {
    const res = await transporter.sendMail({
      from:        buildFrom(creds),
      to:          input.to,
      subject:     input.subject,
      html:        signed,
      text:        input.text ?? htmlToText(signed),
      replyTo:     creds.replyTo ?? undefined,
      attachments: input.attachments,
    });
    _lastSmtpError = null;
    return { messageId: res.messageId, delivered: true };
  } catch (err) {
    _lastSmtpError = {
      message: (err as Error)?.message ?? 'SMTP transport failure',
      from:    buildFrom(creds),
    };
    console.warn('[smtp] send failed', { from: buildFrom(creds), error: err });
    return null;
  }
}

/** Verify the SMTP transport without actually sending. Useful for the
 *  "Verify connection" button on the Settings page. */
export async function verifySmtp(creds: SmtpCreds): Promise<{ ok: true } | { ok: false; error: string }> {
  const transporter = nodemailer.createTransport({
    host:   creds.host,
    port:   creds.port,
    secure: creds.secure,
    auth:   { user: creds.user, pass: creds.pass },
  });
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? 'SMTP verify failed' };
  }
}
