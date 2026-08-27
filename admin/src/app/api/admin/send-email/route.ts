import { NextResponse, type NextRequest } from 'next/server';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { parseBody } from '@/lib/validation/parseBody';
import { email as emailField, htmlBody, optionalUuid, shortText, uuid, z } from '@/lib/validation/primitives';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { MAX_ATTACHMENT_BYTES, tooLargeMessage } from '@/lib/uploadLimits';
import { ATTACHMENT_BUCKET, checkStagedPath } from '@/lib/email/attachmentPaths';
import { createClient as createServiceClient } from '@supabase/supabase-js';
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

// Attachments do NOT ride in this request. The browser uploads each file
// straight to the `email-attachments` bucket (migration 081) and sends only
// its path; this route fetches the bytes server-side.
//
// That is the whole point: a browser→Storage upload never passes through a
// Vercel function, so it is not bound by the 4.5 MB request-body limit that
// the platform enforces at the EDGE — which is what turned a 5.7 MB
// attachment into a bare 413 with no JSON body for the UI to explain.
//
// The body is now JSON. `body_html` is bounded at 200,000 characters, so the
// request stays far under any platform limit whatever is attached.

const TARGET_TYPES = new Set(['athlete', 'company', 'candidate'] as const);
type TargetType = 'athlete' | 'company' | 'candidate';

// POST /api/admin/send-email
// Generic outbound-email endpoint. Composes & sends a freeform
// admin email to any athlete / company contact / candidate, routes
// through Resend (TPS-branded wrapper) or the calling staff
// member's SMTP, attaches files from the multipart body, and
// records the send in the email_log table for activity surfacing.
//
// Body is JSON. Attachments arrive as storage paths, not bytes:
//   target_type     'athlete' | 'company' | 'candidate'
//   target_id       UUID of the recipient entity
//   company_id      optional UUID — passed straight to the log
//   profile_id      optional UUID — the specific client user when
//                   target_type='company' (clients have many users)
//   to              recipient email address
//   subject         email subject
//   body_html       HTML body from the Tiptap editor
//   sender          'resend' | 'smtp'
//   attachments     [{ path, name, size, mime }] — staged in the
//                   email-attachments bucket by the browser
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
  // Staged attachments, by storage path. Bounded: a caller cannot make
  // this route fetch an unbounded number of objects.
  attachments: z.array(z.object({
    path: z.string().min(1).max(512),
    name: z.string().min(1).max(200),
    size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
    mime: z.string().max(200).optional(),
  })).max(20).optional().default([]),
});

/** Service-role client. Bypasses RLS, so every path it is handed must have
 *  cleared `checkStagedPath` against the CALLER's id first. */
function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // Ceiling on a metered/outbound action. Keyed by user rather
  // than IP so one person's bulk run does not throttle the office.
  const rl = limiters.email.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(req, SendEmailSchema);
  if (!parsed.ok) return parsed.response;

  const targetType = parsed.data.target_type;
  const targetId   = parsed.data.target_id;
  const companyId  = parsed.data.company_id;
  const profileId  = parsed.data.profile_id;
  const to         = parsed.data.to;
  const subject    = parsed.data.subject;
  const bodyHtml   = parsed.data.body_html;
  const sender     = parsed.data.sender;

  // ── Fetch the staged attachments ───────────────────────
  // Every path is checked against the CALLER's own id before the service
  // role touches it. The service role bypasses RLS, so this check is the
  // only thing standing between "attach my file" and "read any object in
  // the bucket". Migration 081's RLS enforces the same rule on the upload
  // and on any client-side read; a bypass needs both to be wrong at once.
  const staged = parsed.data.attachments;
  const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
  let totalBytes = 0;

  if (staged.length) {
    let store;
    try {
      store = storageClient();
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }

    for (const item of staged) {
      const verdict = checkStagedPath(item.path, auth.userId);
      if (!verdict.ok) {
        // Loud: a refusal here is either a bug in our own uploader or
        // somebody reaching for a file that is not theirs. Both are worth
        // seeing in a log drain rather than inferring from a 400.
        console.warn(JSON.stringify({
          _audit: true, action: 'email.attachment.refused',
          actor_id: auth.userId, reason: verdict.reason, path: item.path,
        }));
        return NextResponse.json({ error: `Attachment rejected: ${verdict.reason}` }, { status: 400 });
      }

      const { data: blob, error: dlErr } = await store.storage
        .from(ATTACHMENT_BUCKET)
        .download(item.path);
      if (dlErr || !blob) {
        return NextResponse.json({
          error: `Could not read attachment "${item.name}" — it may have expired. Re-attach it and try again.`,
        }, { status: 400 });
      }

      const buf = Buffer.from(await blob.arrayBuffer());
      // Trust the BYTES, not the caller's `size`. A client that under-reports
      // would otherwise walk past the ceiling.
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({
          error: tooLargeMessage(totalBytes, 'The attachments total'),
        }, { status: 413 });
      }
      attachments.push({
        filename: item.name,
        content: buf,
        contentType: item.mime || undefined,
      });
    }
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

  // The mail has gone, so the staged copies are dead weight. Best-effort:
  // a failed delete cannot un-send anything and must not fail the request.
  // Anything missed is swept by /api/cron/prune-email-attachments — the
  // abandoned-modal case never reaches here at all, so the cron is the
  // real guarantee and this is just the tidy path.
  if (staged.length) {
    try {
      await storageClient().storage
        .from(ATTACHMENT_BUCKET)
        .remove(staged.map(a => a.path));
    } catch (err) {
      console.warn('[send-email] staged attachment cleanup failed', err);
    }
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
