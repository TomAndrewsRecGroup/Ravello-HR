import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { encryptSmtpPassword } from '@/lib/email/smtp';

export const runtime = 'nodejs';

interface Body {
  smtp_host?:            string | null;
  smtp_port?:            number | null;
  smtp_secure?:          boolean;
  smtp_user?:            string | null;
  smtp_pass?:            string | null;  // plaintext from form, encrypted before write
  smtp_from_name?:       string | null;
  smtp_from_email?:      string | null;
  smtp_reply_to?:        string | null;
  email_signature_html?: string | null;
  /** True to wipe stored SMTP fields back to null (disable SMTP). */
  clear?:                boolean;
}

// POST /api/admin/settings/smtp
// Upsert the calling staff member's SMTP credentials + signature.
// Password is the only field that needs special handling — we
// encrypt before storage, and skip writing if the body omits it
// (so the form can save updates without re-entering the password).
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (body.clear) {
    const { error } = await supabase
      .from('profiles')
      .update({
        smtp_host:             null,
        smtp_port:             null,
        smtp_secure:           true,
        smtp_user:             null,
        smtp_pass_enc:         null,
        smtp_from_name:        null,
        smtp_from_email:       null,
        smtp_reply_to:         null,
        smtp_last_verified_at: null,
      })
      .eq('id', auth.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: true });
  }

  // Build the patch. Only encrypt + write the password when a new
  // plaintext value is supplied — otherwise leave the existing
  // smtp_pass_enc untouched so updates to other fields don't blank
  // the stored credentials.
  const patch: Record<string, unknown> = {
    smtp_host:        body.smtp_host?.trim()        || null,
    smtp_port:        typeof body.smtp_port === 'number' ? body.smtp_port : null,
    smtp_secure:      body.smtp_secure ?? true,
    smtp_user:        body.smtp_user?.trim()        || null,
    smtp_from_name:   body.smtp_from_name?.trim()   || null,
    smtp_from_email:  body.smtp_from_email?.trim() || null,
    smtp_reply_to:    body.smtp_reply_to?.trim()    || null,
    email_signature_html: body.email_signature_html ?? null,
  };
  if (body.smtp_pass && body.smtp_pass.length > 0) {
    try {
      patch.smtp_pass_enc = encryptSmtpPassword(body.smtp_pass);
    } catch (e) {
      return NextResponse.json({
        error: `Encryption key missing on the server. Set SMTP_PASS_ENCRYPTION_KEY in Vercel env and redeploy. (${(e as Error).message})`,
      }, { status: 500 });
    }
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
