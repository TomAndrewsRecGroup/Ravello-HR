// The SMTP identity the Thursday email goes out under: a staff
// member's own credentials from /settings/email (migration 073). Today
// that is Tom (tom@andrews-recruitment.com, smtp.office365.com).

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSmtpPassword, type SmtpCreds } from '@/lib/email/smtp';

export type SenderResult =
  | { ok: true; creds: SmtpCreds; profileId: string; fromEmail: string }
  | { ok: false; error: string };

export async function loadSender(sb: SupabaseClient, profileId: string | null): Promise<SenderResult> {
  if (!profileId) return { ok: false, error: 'No sender is chosen. Pick one on the Roles email page.' };
  const { data: p, error } = await sb.from('profiles')
    .select('id, role, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc, smtp_from_name, smtp_from_email, smtp_reply_to')
    .eq('id', profileId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the sender: ${error.message}` };
  if (!p) return { ok: false, error: 'The chosen sender no longer exists.' };
  if (p.role !== 'tps_admin') return { ok: false, error: 'The chosen sender is not a staff member.' };
  if (!p.smtp_host || !p.smtp_port || !p.smtp_user || !p.smtp_pass_enc || !p.smtp_from_email) {
    return { ok: false, error: 'The sender has no SMTP set up. Add it under Settings → Email.' };
  }
  let pass: string;
  try {
    pass = decryptSmtpPassword(p.smtp_pass_enc);
  } catch (err) {
    return { ok: false, error: `The sender's SMTP password could not be decrypted: ${(err as Error).message}` };
  }
  return {
    ok: true,
    profileId: p.id,
    fromEmail: p.smtp_from_email,
    creds: {
      host:      p.smtp_host,
      port:      p.smtp_port,
      secure:    p.smtp_secure ?? true,
      user:      p.smtp_user,
      pass,
      fromName:  p.smtp_from_name,
      fromEmail: p.smtp_from_email,
      replyTo:   p.smtp_reply_to,
    },
  };
}
