import type { SupabaseClient } from '@supabase/supabase-js';
import { mintTestToken, burnTestTokens, discardTestToken } from './testTokens';
import { hsTestInviteEmail } from '../email/templates/hsTestInvite';
import { sendKeyedEmail } from '../notify/keyedEmail';
import { portalUrl } from '../portalUrl';

// The one place a test invite is ever sent — the bulk session-creation
// route and the single "Resend link" action both call this, so the
// email and the claim-before-send discipline can never drift apart
// between the two call sites.

export type SendTestInviteOutcome = 'sent' | 'already' | 'failed' | 'no_email' | 'not_found';

export async function sendTestInvite(
  sb: SupabaseClient,
  assignmentId: string,
  dedupeKey: string,
): Promise<{ outcome: SendTestInviteOutcome; error: string | null }> {
  const { data: a } = await sb.from('hs_test_assignments')
    .select('id, employee_id, company_id, test_id, session_id')
    .eq('id', assignmentId).maybeSingle();
  if (!a) return { outcome: 'not_found', error: null };

  const [{ data: employee }, { data: test }, { data: company }, { data: session }] = await Promise.all([
    sb.from('employee_records').select('full_name, email').eq('id', a.employee_id).maybeSingle(),
    sb.from('hs_tests').select('title').eq('id', a.test_id).maybeSingle(),
    sb.from('companies').select('name').eq('id', a.company_id).maybeSingle(),
    a.session_id ? sb.from('hs_test_sessions').select('title').eq('id', a.session_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!employee?.email) return { outcome: 'no_email', error: null };

  const minted = await mintTestToken(sb, assignmentId);
  if ('error' in minted) return { outcome: 'failed', error: minted.error };

  const email = hsTestInviteEmail({
    employeeName: employee.full_name,
    companyName:  company?.name ?? '',
    testTitle:    test?.title ?? 'your test',
    sessionTitle: session?.title ?? null,
    link:         `${portalUrl()}/test/${minted.token}`,
  });

  const result = await sendKeyedEmail(sb, {
    dedupeKey, to: employee.email, subject: email.subject, html: email.html, tag: email.tag,
    target: { type: 'employee', id: a.employee_id }, companyId: a.company_id,
  });

  // A sent link burns every OTHER link for the assignment (the newest
  // email is the one that works); anything else means nobody received
  // this token, so it is discarded rather than left as dead weight.
  if (result.outcome === 'sent') await burnTestTokens(sb, assignmentId, minted.tokenHash);
  else await discardTestToken(sb, minted.tokenHash);

  return { outcome: result.outcome as SendTestInviteOutcome, error: result.error };
}
