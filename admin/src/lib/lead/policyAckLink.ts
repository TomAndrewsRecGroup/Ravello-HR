import type { SupabaseClient } from '@supabase/supabase-js';
import { policyAckRequestEmail } from '@/lib/email';
import { sendKeyedEmail } from '@/lib/notify/keyedEmail';
import { burnPolicyAckTokens, discardPolicyAckToken, mintPolicyAckToken } from '@/lib/auth/policyAckTokens';
import { portalUrl } from '@/lib/portalUrl';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

// Email an employee their personal acknowledgement link. Claimed by
// `dedupeKey` in email_log (keyedEmail), so a re-processed event sends
// nothing; a fresh key (a resend, a reminder) sends a fresh link. Once a
// fresh link has GONE, the older ones are burned, so the newest email is
// the one that works. Order matters: a mint that was never emailed
// (the claim said already) is discarded and the emailed link survives —
// burning first would have killed the link in the inbox on any
// re-processed event.

export type PolicyAckLinkOutcome = 'sent' | 'already' | 'failed' | 'no_email' | 'not_open' | 'not_found';

export async function sendPolicyAckLink(sb: SupabaseClient, ackId: string, dedupeKey: string, opts: { reminder?: boolean; now?: Date } = {}): Promise<{ outcome: PolicyAckLinkOutcome; error: string | null; employeeName: string | null }> {
  const now = opts.now ?? new Date();
  const { data: ackRow } = await sb.from('policy_acknowledgements').select('id, company_id, document_id, employee_id, status').eq('id', ackId).maybeSingle();
  const ack = ackRow as { id: string; company_id: string; document_id: string; employee_id: string; status: string } | null;
  if (!ack) return { outcome: 'not_found', error: null, employeeName: null };
  if (ack.status !== 'pending' && ack.status !== 'overdue') return { outcome: 'not_open', error: null, employeeName: null };

  const [{ data: emp }, { data: doc }, { data: co }] = await Promise.all([
    sb.from('employee_records').select('full_name, email, status').eq('id', ack.employee_id).maybeSingle(),
    sb.from('documents').select('name, category').eq('id', ack.document_id).maybeSingle(),
    sb.from('companies').select('name').eq('id', ack.company_id).maybeSingle(),
  ]);
  const e = emp as { full_name: string; email: string | null; status: string } | null;
  const d = doc as { name: string; category: string } | null;
  const name = e?.full_name ?? null;
  if (!e || !d) return { outcome: 'not_found', error: null, employeeName: name };
  if (!e.email?.trim()) return { outcome: 'no_email', error: null, employeeName: name };

  // Mint before the claim (the email needs the link).
  const minted = await mintPolicyAckToken(sb, ack.id, now.getTime());
  if ('error' in minted) return { outcome: 'failed', error: minted.error, employeeName: name };

  const message = policyAckRequestEmail({
    employeeName: e.full_name, companyName: (co as { name?: string } | null)?.name ?? '',
    documentName: d.name, documentCategory: d.category, link: `${portalUrl()}/policy/${minted.token}`,
    expiresAt: minted.expiresAt, reminder: !!opts.reminder,
  });
  const r = await sendKeyedEmail(sb, {
    dedupeKey, to: e.email.trim(), subject: message.subject, html: message.html, tag: message.tag,
    target: { type: 'employee', id: ack.employee_id }, companyId: ack.company_id,
  });
  if (r.outcome !== 'sent') {
    await discardPolicyAckToken(sb, minted.tokenHash);
    return r.outcome === 'already' ? { outcome: 'already', error: null, employeeName: name } : { outcome: 'failed', error: r.error, employeeName: name };
  }
  await burnPolicyAckTokens(sb, ack.id, minted.tokenHash);
  const res = await sb.from('policy_acknowledgements').update({ link_sent_at: now.toISOString() }, COUNT_EXACT).eq('id', ack.id);
  judgeWrite({ error: res.error, count: res.count });
  return { outcome: 'sent', error: null, employeeName: name };
}
