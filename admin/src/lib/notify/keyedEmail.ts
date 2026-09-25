import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, lastEmailError } from '@/lib/email';
import { brandFromAddress } from '@/lib/brand';
import { COUNT_EXACT } from '@/lib/supabase/mutations';

// An email with no notification row behind it (a raiser's receipt, a
// weekly digest): claim by inserting the email_log row FIRST under a
// unique dedupe key, then send, then fill in the outcome. A second
// attempt with the same key finds the row and sends nothing.

export interface KeyedEmailInput {
  dedupeKey:  string;
  to:         string;
  subject:    string;
  html:       string;
  tag?:       string;
  target:     { type: 'user' | 'employee' | 'company' | 'candidate' | 'provider'; id: string; profileId?: string | null };
  companyId:  string | null;
}

export type KeyedEmailOutcome = 'sent' | 'failed' | 'already';

export async function sendKeyedEmail(sb: SupabaseClient, e: KeyedEmailInput): Promise<{ outcome: KeyedEmailOutcome; error: string | null }> {
  const { data: claimed, error } = await sb.from('email_log').upsert({
    dedupe_key:    e.dedupeKey,
    target_type:   e.target.type,
    target_id:     e.target.id,
    company_id:    e.companyId,
    profile_id:    e.target.profileId ?? null,
    to_email:      e.to,
    subject:       e.subject,
    body_html:     e.html,
    sender_kind:   'resend',
    sender_email:  brandFromAddress(process.env.EMAIL_FROM),
    sent_by:       null,
    provider_id:   null,
    error_message: 'claimed',
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(`email_log claim: ${error.message}`);
  const row = (claimed ?? [])[0] as { id: string } | undefined;
  if (!row) return { outcome: 'already', error: null };

  const result = await sendEmail({ to: e.to, subject: e.subject, html: e.html, tag: e.tag });
  const errorMessage = result?.delivered ? null : (lastEmailError()?.message ?? 'Email send failed.');
  await sb.from('email_log').update({ provider_id: result?.delivered ? result.id : null, error_message: errorMessage }, COUNT_EXACT).eq('id', row.id);
  return { outcome: errorMessage ? 'failed' : 'sent', error: errorMessage };
}
