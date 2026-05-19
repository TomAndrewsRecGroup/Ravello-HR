import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import {
  decryptSmtpPassword,
  sendViaSmtp,
  verifySmtp,
  lastSmtpError,
  type SmtpCreds,
} from '@/lib/email/smtp';

export const runtime = 'nodejs';

interface Body {
  to:    string;        // recipient for the test email
  mode?: 'verify' | 'send';
}

// POST /api/admin/settings/smtp/test
// Loads the caller's stored SMTP credentials, decrypts the password,
// then either:
//   - mode='verify' → calls nodemailer transporter.verify() — confirms
//     host/port/auth without sending anything;
//   - mode='send' (default) → sends a small "this is a test" email
//     using the configured creds and signature.
// On success in send mode, stamps profiles.smtp_last_verified_at.
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const mode = body.mode ?? 'send';
  if (mode === 'send' && !body.to?.trim()) {
    return NextResponse.json({ error: 'Recipient email is required for a test send.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: row, error: loadErr } = await supabase
    .from('profiles')
    .select('smtp_host,smtp_port,smtp_secure,smtp_user,smtp_pass_enc,smtp_from_name,smtp_from_email,smtp_reply_to,email_signature_html')
    .eq('id', auth.userId)
    .single();
  if (loadErr || !row) {
    return NextResponse.json({ error: loadErr?.message ?? 'Profile not found' }, { status: 500 });
  }
  if (!row.smtp_host || !row.smtp_port || !row.smtp_user || !row.smtp_pass_enc || !row.smtp_from_email) {
    return NextResponse.json({
      error: 'SMTP not fully configured. Fill host / port / username / password / from-email and save first.',
    }, { status: 400 });
  }

  let plaintextPass: string;
  try {
    plaintextPass = decryptSmtpPassword(row.smtp_pass_enc);
  } catch (e) {
    return NextResponse.json({
      error: `Could not decrypt stored SMTP password. Re-enter the password and save. (${(e as Error).message})`,
    }, { status: 500 });
  }

  const creds: SmtpCreds = {
    host:      row.smtp_host,
    port:      row.smtp_port,
    secure:    row.smtp_secure ?? true,
    user:      row.smtp_user,
    pass:      plaintextPass,
    fromName:  row.smtp_from_name,
    fromEmail: row.smtp_from_email,
    replyTo:   row.smtp_reply_to,
  };

  if (mode === 'verify') {
    const verifyResult = await verifySmtp(creds);
    if (!verifyResult.ok) {
      return NextResponse.json({ error: verifyResult.error }, { status: 502 });
    }
    await supabase
      .from('profiles')
      .update({ smtp_last_verified_at: new Date().toISOString() })
      .eq('id', auth.userId);
    return NextResponse.json({ ok: true, verified_at: new Date().toISOString() });
  }

  const subject = 'TPS — SMTP test email';
  const html = `
    <p>This is a test email from your <strong>The People System</strong> admin SMTP configuration.</p>
    <p>If you can read this with your signature below, your SMTP settings are working correctly.</p>
    <p style="color:#6B7280;font-size:12px;">Sent ${new Date().toLocaleString('en-GB')} by ${creds.fromEmail}</p>
  `;
  const result = await sendViaSmtp(creds, {
    to:            body.to.trim(),
    subject,
    html,
    signatureHtml: row.email_signature_html ?? undefined,
  });
  if (!result) {
    const err = lastSmtpError();
    return NextResponse.json({ error: err?.message ?? 'SMTP send failed.' }, { status: 502 });
  }

  await supabase
    .from('profiles')
    .update({ smtp_last_verified_at: new Date().toISOString() })
    .eq('id', auth.userId);

  return NextResponse.json({ ok: true, message_id: result.messageId });
}
