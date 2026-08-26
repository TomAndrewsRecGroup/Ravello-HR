import { NextResponse, type NextRequest } from 'next/server';
import { parseForm } from '@/lib/validation/parseForm';
import { email as emailField, htmlBody, optionalUuid, shortText, uuid, z } from '@/lib/validation/primitives';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { sendEmail, wrapEmail, lastEmailError } from '@/lib/email';
import {
  decryptSmtpPassword,
  sendViaSmtp,
  lastSmtpError,
  type SmtpCreds,
} from '@/lib/email/smtp';

export const runtime    = 'nodejs';
export const maxDuration = 60;

const ATTACHMENT_TOTAL_CAP = 25 * 1024 * 1024;     // 25 MB across all files
const ATTACHMENT_FILE_CAP  = 15 * 1024 * 1024;     // single-file cap, slightly under

const TARGET_TYPES = new Set(['athlete', 'company', 'candidate'] as const);
type TargetType = 'athlete' | 'company' | 'candidate';

// POST /api/admin/send-email
// Generic outbound-email endpoint. Composes & sends a freeform
// admin email to any athlete / company contact / candidate, routes
// through Resend (TPS-branded wrapper) or the calling staff
// member's SMTP, attaches files from the multipart body, and
// records the send in the email_log table for activity surfacing.
//
// Body is multipart/form-data because attachments are real files:
//   target_type     'athlete' | 'company' | 'candidate'
//   target_id       UUID of the recipient entity
//   company_id      optional UUID — passed straight to the log
//   profile_id      optional UUID — the specific client user when
//                   target_type='company' (clients have many users)
//   to              recipient email address
//   subject         email subject
//   body_html       HTML body from the Tiptap editor
//   sender          'resend' | 'smtp'
//   attachment-*    one or more File parts
// This sends arbitrary HTML to an arbitrary address on behalf of the
// business. The previous checks caught missing fields but never checked
// that `to` was an email at all, and put no ceiling on subject or body.
const SendEmailSchema = z.object({
  target_type: z.enum(['athlete', 'company', 'candidate']),
  target_id:   uuid,
  company_id:  optionalUuid,
  profile_id:  optionalUuid,
  to:          emailField,
  subject:     shortText(300),
  body_html:   htmlBody(200_000),
  sender:      z.enum(['resend', 'smtp']).default('resend'),
});

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const parsed = await parseForm(req, SendEmailSchema);
  if (!parsed.ok) return parsed.response;
  const form = parsed.form!;

  const targetType = parsed.data.target_type;
  const targetId   = parsed.data.target_id;
  const companyId  = parsed.data.company_id;
  const profileId  = parsed.data.profile_id;
  const to         = parsed.data.to;
  const subject    = parsed.data.subject;
  const bodyHtml   = parsed.data.body_html;
  const sender     = parsed.data.sender;

  // ── Collect attachments ────────────────────────────────
  const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
  let totalBytes = 0;
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('attachment')) continue;
    if (!(value instanceof File))      continue;
    if (value.size > ATTACHMENT_FILE_CAP) {
      return NextResponse.json({ error: `Attachment "${value.name}" exceeds 15 MB limit` }, { status: 413 });
    }
    totalBytes += value.size;
    if (totalBytes > ATTACHMENT_TOTAL_CAP) {
      return NextResponse.json({ error: 'Total attachments exceed 25 MB limit' }, { status: 413 });
    }
    const buf = Buffer.from(await value.arrayBuffer());
    attachments.push({ filename: value.name, content: buf, contentType: value.type || undefined });
  }
  const attachmentMeta = attachments.map(a => ({
    name: a.filename,
    size: a.content.byteLength,
    mime: a.contentType ?? 'application/octet-stream',
  }));

  // ── Resolve sender identity (decrypts SMTP password when needed) ──
  const supabase = createServerSupabaseClient();
  const { data: me, error: meErr } = await supabase
    .from('profiles')
    .select('email,full_name,smtp_host,smtp_port,smtp_secure,smtp_user,smtp_pass_enc,smtp_from_name,smtp_from_email,smtp_reply_to,email_signature_html')
    .eq('id', auth.userId)
    .single();
  if (meErr || !me) {
    return NextResponse.json({ error: meErr?.message ?? 'Could not load your profile' }, { status: 500 });
  }

  let providerId: string | null = null;
  let errorMessage: string | null = null;
  let senderEmail = process.env.EMAIL_FROM?.match(/<([^>]+)>/)?.[1] ?? 'noreply@portal.thepeoplesystem.co.uk';

  if (sender === 'smtp') {
    if (!me.smtp_host || !me.smtp_port || !me.smtp_user || !me.smtp_pass_enc || !me.smtp_from_email) {
      return NextResponse.json({
        error: 'You haven\'t finished setting up SMTP. Go to Settings → Email and complete the host / port / username / password / from-email fields, then try again.',
      }, { status: 400 });
    }
    let plaintextPass: string;
    try {
      plaintextPass = decryptSmtpPassword(me.smtp_pass_enc);
    } catch (e) {
      return NextResponse.json({
        error: `Could not decrypt your SMTP password — re-enter it in Settings → Email. (${(e as Error).message})`,
      }, { status: 500 });
    }
    const creds: SmtpCreds = {
      host:      me.smtp_host,
      port:      me.smtp_port,
      secure:    me.smtp_secure ?? true,
      user:      me.smtp_user,
      pass:      plaintextPass,
      fromName:  me.smtp_from_name,
      fromEmail: me.smtp_from_email,
      replyTo:   me.smtp_reply_to,
    };
    senderEmail = me.smtp_from_email;
    const result = await sendViaSmtp(creds, {
      to,
      subject,
      html:          bodyHtml,
      signatureHtml: me.email_signature_html ?? undefined,
      attachments,
    });
    if (!result) {
      const err = lastSmtpError();
      errorMessage = err?.message ?? 'SMTP send failed.';
    } else {
      providerId = result.messageId;
    }
  } else {
    // Resend path — wrap the body in the standard TPS shell so the
    // email arrives branded. Signature is intentionally NOT appended
    // here (Resend emails come from the TPS no-reply identity).
    const wrapped = wrapEmail(bodyHtml, subject);
    const result = await sendEmail({
      to,
      subject,
      html: wrapped,
      tag:  'admin-compose',
      attachments,
    });
    if (!result || !result.delivered) {
      const err = lastEmailError();
      errorMessage = err?.message ?? 'Resend send failed.';
    } else {
      providerId = result.id;
    }
  }

  // ── Always log the attempt (success or failure) ────────
  const { data: logRow, error: logErr } = await supabase
    .from('email_log')
    .insert({
      target_type:   targetType,
      target_id:     targetId,
      company_id:    companyId,
      profile_id:    profileId,
      to_email:      to,
      subject,
      body_html:     bodyHtml,
      attachments:   attachmentMeta,
      sender_kind:   sender,
      sender_email:  senderEmail,
      sent_by:       auth.userId,
      provider_id:   providerId,
      error_message: errorMessage,
    })
    .select('id')
    .single();
  if (logErr) {
    // The send itself may have succeeded, so we don't want to mask
    // that. Surface the log error but include the provider id.
    console.warn('[send-email] log insert failed', logErr);
  }

  if (errorMessage) {
    return NextResponse.json({ error: errorMessage, log_id: logRow?.id ?? null }, { status: 502 });
  }

  auditLog({
    action:      'email.sent',
    actor_id:    auth.userId,
    target_id:   targetId,
    target_type: targetType,
    metadata: {
      to, subject, sender_kind: sender, sender_email: senderEmail, provider_id: providerId,
      attachment_count: attachmentMeta.length, log_id: logRow?.id ?? null,
    },
  });

  return NextResponse.json({
    ok:          true,
    log_id:      logRow?.id ?? null,
    provider_id: providerId,
    sender_kind: sender,
    sender_email: senderEmail,
  });
}

// Helper so the validation lines stay one-per-rule.
const status400 = { status: 400 } as const;
