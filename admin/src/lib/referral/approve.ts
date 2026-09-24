// Sending a referral invite by hand: the review queue's Approve, the
// funnel's Apply override, and "Send all qualified".
//
// All three used to live inline in PATCH /api/admin/referrals/[id], in
// the same order the cron used before 2026-09-24: read the status, send,
// THEN write email_sent. Two clicks (or one bulk run racing a click) both
// read `qualified`, both send. Now:
//
//   1. refuse if this address was already sent this role's invite —
//      email_log is the record of what actually went out, and the 21–24
//      Sep duplicate-send bug left three people at `qualified` who had
//      each been emailed 21+ times;
//   2. CLAIM the row: a conditional update to email_sent that only
//      matches while the status is still the one we read. Losing that
//      race means someone else is sending — no email;
//   3. send; on failure put the status back so the row stays visibly
//      outstanding.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendReferralInvite } from './pipeline';
import { referralInviteSubject } from '../email/templates/referralInvite';
import { MANUAL_STATUSES, STATUS_META } from './statusMeta';
import type { ReferralStatus } from './types';

export type SendOutcome =
  | { ok: true;  status: 'email_sent' }
  | { ok: false; httpStatus: number; error: string };

export interface SendOptions {
  /** Staff user id, recorded on the row and the email_log entry. */
  actor: string;
  /** 'apply' overrules a rejection; 'approve' is queue/qualified only. */
  mode: 'approve' | 'apply';
}

const one = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);

export async function sendInviteForApplication(
  supabase: SupabaseClient,
  appId: string,
  { actor, mode }: SendOptions,
): Promise<SendOutcome> {
  const { data: app, error: readErr } = await supabase
    .from('referral_applications')
    .select(`
      id, status, candidate_id, company_id, requisition_id, manatal_candidate_id, status_history,
      candidate:candidates!inner ( id, full_name, email ),
      requisition:requisitions!inner ( id, title )
    `)
    .eq('id', appId)
    .single();

  if (readErr || !app) {
    return { ok: false, httpStatus: 404, error: 'Referral application not found' };
  }

  const candidate   = one((app as any).candidate);
  const requisition = one((app as any).requisition);
  const from        = app.status as ReferralStatus;

  // referral_role_config has NO foreign key to referral_applications, so
  // it cannot be embedded above (PGRST200). See CLAUDE.md, 2026-09-04.
  const { data: config, error: configErr } = await supabase
    .from('referral_role_config')
    .select(`
      requisition_id, enabled, dry_run, partner_name, referral_url, email_process_note,
      auto_send_threshold, review_threshold, blocked_countries, mandatory_criteria
    `)
    .eq('requisition_id', app.requisition_id)
    .single();

  if (configErr || !config) {
    return { ok: false, httpStatus: 404, error: 'This role has no referral configuration saved.' };
  }

  if (mode === 'apply') {
    if (from === 'email_sent' || MANUAL_STATUSES.includes(from)) {
      return {
        ok: false, httpStatus: 409,
        error: `An invite has already gone out for this application (status "${STATUS_META[from]?.label ?? from}") — Apply cannot re-send it.`,
      };
    }
  } else if (from !== 'review_pending' && from !== 'qualified') {
    return { ok: false, httpStatus: 409, error: `Only a queued or qualified candidate can be approved (this one is "${from}").` };
  }

  if (!candidate?.email) {
    return { ok: false, httpStatus: 422, error: 'No email address on file for this candidate.' };
  }

  // 1. Already sent? Matched on address + this role's subject, not on
  //    candidate_id: the old bug created a fresh candidates row per send.
  const { count: priorSends, error: priorErr } = await supabase
    .from('email_log')
    .select('id', { count: 'exact', head: true })
    .eq('to_email', candidate.email)
    .eq('subject', referralInviteSubject(requisition.title))
    .is('error_message', null);

  if (priorErr) {
    // Cannot tell whether they were emailed, so do not risk it.
    return { ok: false, httpStatus: 503, error: `Could not check whether this candidate was already emailed: ${priorErr.message}` };
  }
  if ((priorSends ?? 0) > 0) {
    return { ok: false, httpStatus: 409, error: `This candidate has already been sent the invite for this role (${priorSends} time${priorSends === 1 ? '' : 's'}).` };
  }

  // 2. Claim.
  const { count: claimed, error: claimErr } = await supabase
    .from('referral_applications')
    .update({ status: 'email_sent', reviewed_by: actor }, { count: 'exact' })
    .eq('id', appId)
    .eq('status', from);

  if (claimErr) {
    return { ok: false, httpStatus: 500, error: `Could not reserve this application: ${claimErr.message}` };
  }
  if (claimed !== 1) {
    return { ok: false, httpStatus: 409, error: 'This application is already being sent, or changed since the page loaded. Refresh and check.' };
  }

  // 3. Send.
  const sent = await sendReferralInvite({
    supabase,
    toEmail:     candidate.email,
    fullName:    candidate.full_name,
    roleTitle:   requisition.title,
    companyId:   app.company_id,
    candidateId: app.candidate_id,
    manatalCandidateId: (app as any).manatal_candidate_id ?? null,
    requisitionId:      app.requisition_id,
    config,
    sentBy:      actor,
  });

  const now     = new Date().toISOString();
  const history = Array.isArray(app.status_history) ? app.status_history : [];

  if (!sent.sent) {
    // Release the claim so the row reads as outstanding, not sent.
    await supabase
      .from('referral_applications')
      .update({ status: from }, { count: 'exact' })
      .eq('id', appId)
      .eq('status', 'email_sent');
    return { ok: false, httpStatus: 502, error: `Email failed: ${sent.error}` };
  }

  const { count: recorded, error: recordErr } = await supabase
    .from('referral_applications')
    .update({
      email_sent_at:     now,
      email_provider_id: sent.providerId,
      reviewed_at:       now,
      status_history:    [...history, { at: now, from, to: 'email_sent', by: actor, reasons: [
        mode === 'apply'
          ? `Manually applied — overrides the "${STATUS_META[from]?.label ?? from}" decision.`
          : from === 'qualified' ? 'Invite sent by hand (held by dry run).' : 'Approved from the review queue.',
      ] }],
    }, { count: 'exact' })
    .eq('id', appId);

  if (recordErr || recorded !== 1) {
    // The email went and the status already reads email_sent, so nobody
    // can be re-sent; only the timestamp/history detail is missing.
    console.error(JSON.stringify({ _audit: true, action: 'referral.approve.record_failed', appId, error: recordErr?.message ?? `${recorded ?? 0} rows` }));
  }

  return { ok: true, status: 'email_sent' };
}
