// The referral pipeline's one processing path.
//
// Shared by the hourly cron and the review queue's Approve action so
// there is exactly one place that decides a candidate's outcome and
// one place that sends the email. A second copy is the thing nobody
// re-checks when a rule changes.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getManatalCandidate,
  getManatalMatchesForJob,
  isJobBoardApplicant,
  manatalRefId,
  type ManatalCandidate,
  type ManatalMatch,
} from '../manatal';
import { lastEmailError, sendEmail } from '../email/client';
import { referralInviteEmail } from '../email/templates/referralInvite';
import { greetingName, placeholderName } from './candidateName';
import { buildScanText } from './cvText';
import { evaluate } from './gate';
import { runCandidateScan } from './ivylensScan';
import type { MandatoryCriterion, ReferralRoleConfig, ReferralStatus, ScanSource } from './types';

/** Per-run ceiling. Each candidate costs a Manatal read, a CV fetch
 *  and an LLM scan — call it 5-15s. At ~15 applicants/day across all
 *  roles this never binds in steady state; it exists so a first run
 *  against a backlog drains over several hours instead of hitting
 *  maxDuration and losing the whole batch. */
export const DEFAULT_BATCH_CAP = 25;

/** Wall-clock reserve. The cron's maxDuration is 300s; stopping at 255s
 *  leaves room to finish the row in flight and write the tally. Being
 *  killed at 300s mid-write loses the whole run's reporting, which is
 *  how "0 emailed" becomes a mystery instead of a number. */
export const RUN_BUDGET_MS = 255_000;

export interface RunBudget {
  /** Candidates still allowed this run. */
  left: number;
  /** Absolute epoch-ms ceiling for the whole run. */
  deadline: number;
}

export function budgetExhausted(budget: RunBudget): boolean {
  return budget.left <= 0 || Date.now() >= budget.deadline;
}

export interface RoleRow extends ReferralRoleConfig {
  requisition: {
    id:              string;
    title:           string;
    company_id:      string;
    manatal_job_id:  string | null;
    ivylens_role_id: string | null;
    jd_text:         string | null;
    description:     string | null;
  };
}

export interface Tally {
  roles_considered:   number;
  roles_skipped:      number;
  matches_seen:       number;
  already_processed:  number;
  /** Matches skipped because a recruiter attached them, rather than the
   *  candidate applying. Counted so "fewer than I expected" has an
   *  answer instead of being something to debug. */
  recruiter_added_skips: number;
  scanned:            number;
  qualified:          number;
  emailed:            number;
  queued_for_review:  number;
  rejected_country:   number;
  rejected_criteria:  number;
  rejected_score:     number;
  scan_errors:        number;
  email_failures:     number;
  dry_run_skips:      number;
  no_consent_skips:   number;
  no_email_skips:     number;
  cv_pdf:             number;
  manatal_parsed:     number;
  remaining:          number;
  /** Circuit-breaker state per vendor at the end of the run. An open
   *  breaker explains a run that processed far fewer than it could. */
  vendor_breakers:    Record<string, { failures: number; open: boolean }>;
  notes:              string[];
}

export function emptyTally(): Tally {
  return {
    roles_considered: 0, roles_skipped: 0, matches_seen: 0, already_processed: 0,
    recruiter_added_skips: 0,
    scanned: 0, qualified: 0, emailed: 0, queued_for_review: 0,
    rejected_country: 0, rejected_criteria: 0, rejected_score: 0,
    scan_errors: 0, email_failures: 0, dry_run_skips: 0,
    no_consent_skips: 0, no_email_skips: 0,
    cv_pdf: 0, manatal_parsed: 0, remaining: 0, vendor_breakers: {}, notes: [],
  };
}

function coerceCriteria(raw: unknown): MandatoryCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(c => c && typeof c === 'object' && 'key' in c) as MandatoryCriterion[];
}

/* ─── Email ────────────────────────────────────────────────── */

export interface SendOutcome {
  sent:       boolean;
  providerId: string | null;
  error:      string | null;
}

/** Send one referral invitation and log it.
 *
 *  The caller must only advance a row to 'email_sent' when this
 *  reports sent: true. sendEmail() returns null rather than throwing,
 *  so a swallowed failure would otherwise mark somebody emailed who
 *  never was — and the idempotency guard would then stop us ever
 *  retrying them. */
export async function sendReferralInvite(args: {
  supabase:    SupabaseClient;
  toEmail:     string;
  /** The stored label. May be a placeholder — the greeting is derived
   *  through greetingName(), which refuses to use one. */
  fullName:    string | null;
  roleTitle:   string;
  companyId:   string | null;
  candidateId: string;
  config:      ReferralRoleConfig;
  sentBy?:     string | null;
}): Promise<SendOutcome> {
  const mail = referralInviteEmail({
    to:          args.toEmail,
    // greetingName, never the raw label: `fullName` may be a
    // placeholder, and on the Approve path it is read straight out of
    // candidates.full_name. See candidateName.ts.
    firstName:   greetingName(args.fullName),
    roleTitle:   args.roleTitle,
    partnerName: args.config.partner_name,
    referralUrl: args.config.referral_url,
    processNote: args.config.email_process_note ?? undefined,
  });

  const res = await sendEmail(mail);
  const err = res ? null : (lastEmailError()?.message ?? 'Resend returned no id.');

  // Audit every attempt, successful or not — a rejected domain or a
  // bounce is exactly what someone comes looking for later.
  await args.supabase.from('email_log').insert({
    target_type:   'candidate',
    target_id:     args.candidateId,
    company_id:    args.companyId,
    to_email:      args.toEmail,
    subject:       mail.subject,
    body_html:     mail.html,
    sender_kind:   'resend',
    sender_email:  process.env.EMAIL_FROM ?? 'noreply@portal.thepeoplesystem.co.uk',
    sent_by:       args.sentBy ?? null,
    provider_id:   res?.id ?? null,
    error_message: err,
  });

  return { sent: Boolean(res), providerId: res?.id ?? null, error: err };
}

/* ─── One candidate ────────────────────────────────────────── */

/** Process a single Manatal match into a referral_applications row.
 *
 *  Never throws. A candidate that cannot be handled is recorded as
 *  scan_error and stepped over — one malformed CV must not abort the
 *  batch behind it. */
export async function processMatch(
  supabase: SupabaseClient,
  role: RoleRow,
  match: ManatalMatch,
  tally: Tally,
  budget: RunBudget,
): Promise<void> {
  const manatalCandidateId = manatalRefId(match.candidate);
  if (!manatalCandidateId) {
    tally.scan_errors++;
    tally.notes.push('A match arrived with no candidate id and was skipped.');
    return;
  }

  const config: ReferralRoleConfig = {
    ...role,
    mandatory_criteria: coerceCriteria(role.mandatory_criteria),
  };

  let candidate: ManatalCandidate | null = null;
  let scanSource: ScanSource | null = null;
  let cvError: string | undefined;
  let scanId: string | null = null;
  let scanErr: string | null = null;
  let decision: ReturnType<typeof evaluate>;
  let matchedSkills: unknown[] = [];
  let strengths: unknown[] = [];
  let gaps: unknown[] = [];

  try {
    // Read fresh: this is the only call that yields a live presigned
    // resume URL, and it expires about an hour after issue.
    candidate = await getManatalCandidate(manatalCandidateId, { deadline: budget.deadline });
    if (!candidate) throw new Error('Candidate could not be read from Manatal.');

    // ── Country first, so an ineligible applicant costs no AI ──
    const preGate = evaluate({ location: candidate.candidate_location, config, scan: null });
    if (preGate.status === 'rejected_country') {
      decision = preGate;
    } else {
      const cv = await buildScanText(candidate);
      scanSource = cv.source;
      cvError    = cv.error;
      if (cv.source === 'cv_pdf') tally.cv_pdf++; else tally.manatal_parsed++;

      const outcome = await runCandidateScan({
        candidateText: cv.text,
        roleId:        role.requisition.ivylens_role_id,
        roleText:      role.requisition.jd_text ?? role.requisition.description,
        deadline:      budget.deadline,
      });

      if (!outcome.scan) {
        scanErr  = outcome.error;
        decision = {
          status:          'scan_error' as ReferralStatus,
          score:           null,
          countryResult:   'approved',
          countryDetected: candidate.candidate_location ?? null,
          failedCriteria:  [],
          reasons:         [`Scan failed: ${outcome.error}`],
        };
      } else {
        scanId        = outcome.scan.scan_id ?? null;
        matchedSkills = outcome.scan.skill_matches ?? [];
        strengths     = outcome.scan.strengths ?? [];
        gaps          = outcome.scan.gaps ?? [];
        decision      = evaluate({ location: candidate.candidate_location, config, scan: outcome.scan });
        tally.scanned++;
      }
    }
  } catch (err) {
    scanErr  = (err as Error)?.message ?? 'Unknown error processing candidate.';
    decision = {
      status: 'scan_error' as ReferralStatus,
      score: null, countryResult: 'unknown', countryDetected: null,
      failedCriteria: [], reasons: [scanErr],
    };
  }

  if (cvError) decision.reasons.push(`CV note: ${cvError}`);

  // ── Persist the person, then the journey ──
  // Two different things, deliberately not one variable. `realName` is
  // what this person is called and is the ONLY thing the email may
  // greet them by; `fullName` is the row label, which may be a
  // placeholder because every applicant needs a row.
  const realName = (candidate?.full_name ?? '').trim() || null;
  const fullName = realName ?? placeholderName(manatalCandidateId);
  const email    = candidate?.email ?? null;

  // cv_url is deliberately NOT stored. Manatal's resume link is a
  // presigned URL that dies within the hour, so persisting it would
  // leave a permanently broken link in the admin UI — worse than no
  // link, because it looks like it should work. The CV is re-read from
  // Manatal on demand instead.
  const { data: candidateRow, error: candErr } = await supabase
    .from('candidates')
    .insert({
      requisition_id: role.requisition.id,
      company_id:     role.requisition.company_id,
      full_name:      fullName,
      email,
      phone:          candidate?.phone_number ?? null,
      summary:        candidate?.current_position ?? null,
      source:         'job_board',
      pipeline_stage: 'applied',
    })
    .select('id')
    .single();

  if (candErr || !candidateRow) {
    tally.scan_errors++;
    tally.notes.push(`Could not create candidate row for Manatal ${manatalCandidateId}: ${candErr?.message}`);
    return;
  }

  let status: ReferralStatus = decision.status;
  let emailSentAt: string | null = null;
  let emailProviderId: string | null = null;

  // ── Email, only when everything lines up ──
  if (status === 'qualified') {
    tally.qualified++;

    if (config.dry_run) {
      tally.dry_run_skips++;
      decision.reasons.push('Dry run is on for this role — qualified but no email sent.');
    } else if (!email) {
      tally.no_email_skips++;
      decision.reasons.push('Qualified but Manatal holds no email address for this candidate.');
    } else if (candidate?.consent === false) {
      // Manatal stamps consent at application. An explicit false is a
      // refusal and is honoured; null/undefined is an older record
      // rather than a refusal, so it does not block.
      tally.no_consent_skips++;
      decision.reasons.push('Qualified but the candidate has not consented to contact in Manatal.');
    } else {
      const sent = await sendReferralInvite({
        supabase,
        toEmail:     email,
        fullName:    realName,
        roleTitle:   role.requisition.title,
        companyId:   role.requisition.company_id,
        candidateId: candidateRow.id,
        config,
      });
      if (sent.sent) {
        status          = 'email_sent';
        emailSentAt     = new Date().toISOString();
        emailProviderId = sent.providerId;
        tally.emailed++;
        decision.reasons.push('Referral invitation sent.');
      } else {
        // Stays 'qualified' so it is visibly outstanding rather than
        // silently marked done.
        tally.email_failures++;
        decision.reasons.push(`Email failed: ${sent.error}`);
      }
    }
  }

  if (status === 'review_pending')    tally.queued_for_review++;
  if (status === 'rejected_country')  tally.rejected_country++;
  if (status === 'rejected_criteria') tally.rejected_criteria++;
  if (status === 'rejected_score')    tally.rejected_score++;
  if (status === 'scan_error')        tally.scan_errors++;

  const now = new Date().toISOString();
  const { error: appErr } = await supabase.from('referral_applications').insert({
    candidate_id:         candidateRow.id,
    requisition_id:       role.requisition.id,
    company_id:           role.requisition.company_id,
    manatal_candidate_id: manatalCandidateId,
    manatal_match_id:     match.id ? String(match.id) : null,
    status,
    match_score:          decision.score,
    scan_source:          scanSource,
    country_detected:     decision.countryDetected,
    country_gate_result:  decision.countryResult,
    failed_criteria:      decision.failedCriteria,
    matched_skills:       matchedSkills,
    strengths,
    gaps,
    ivylens_scan_id:      scanId,
    scan_error:           scanErr,
    scanned_at:           now,
    email_sent_at:        emailSentAt,
    email_provider_id:    emailProviderId,
    status_history:       [{ at: now, from: null, to: status, by: 'cron', reasons: decision.reasons }],
  });

  if (appErr) {
    // A unique violation means a concurrent run beat us to it — benign.
    // The orphan candidate row is removed either way so a retry is not
    // blocked by a half-written pair.
    await supabase.from('candidates').delete().eq('id', candidateRow.id);
    if (/duplicate key|unique/i.test(appErr.message)) {
      tally.already_processed++;
    } else {
      tally.notes.push(`Could not record referral application for Manatal ${manatalCandidateId}: ${appErr.message}`);
    }
  }
}

/* ─── One role ─────────────────────────────────────────────── */

export async function processRole(
  supabase: SupabaseClient,
  role: RoleRow,
  tally: Tally,
  budget: RunBudget,
): Promise<void> {
  const jobId = role.requisition.manatal_job_id;
  if (!jobId) {
    tally.roles_skipped++;
    tally.notes.push(`"${role.requisition.title}" has no manatal_job_id — publish it to Manatal first.`);
    return;
  }
  if (!role.approved_countries?.length) {
    // The gate would refuse everyone anyway; saying so is more useful
    // than a run of silent country rejections.
    tally.roles_skipped++;
    tally.notes.push(`"${role.requisition.title}" has an empty approved-country list — every applicant would be refused. Configure it before enabling.`);
    return;
  }

  tally.roles_considered++;

  const { matches: allMatches, truncated } = await getManatalMatchesForJob(jobId, { deadline: budget.deadline });
  if (truncated) {
    // A partial read presented as complete is how "every applicant was
    // scanned" quietly stops being true.
    tally.notes.push(`"${role.requisition.title}": could not read every applicant from Manatal — some were not considered this run.`);
  }

  // Only people who APPLIED. A candidate the operator sourced and
  // attached to the job themselves carries a `creator`; referring them
  // on would email their own shortlist a partner's referral link.
  const matches = allMatches.filter(isJobBoardApplicant);
  tally.recruiter_added_skips += allMatches.length - matches.length;

  tally.matches_seen += matches.length;
  if (!matches.length) return;

  // The idempotency guard, applied before any work: a candidate we
  // already hold a row for is never reconsidered for this role, so
  // nobody can be emailed twice.
  const ids = matches.map(m => manatalRefId(m.candidate)).filter(Boolean);
  const { data: existing } = await supabase
    .from('referral_applications')
    .select('manatal_candidate_id')
    .eq('requisition_id', role.requisition.id)
    .in('manatal_candidate_id', ids);

  const seen  = new Set((existing ?? []).map(r => r.manatal_candidate_id as string));
  const fresh = matches.filter(m => !seen.has(manatalRefId(m.candidate)));
  tally.already_processed += matches.length - fresh.length;

  // Oldest first, so a backlog drains in application order rather than
  // starving whoever applied first.
  fresh.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

  for (const match of fresh) {
    // Two ceilings, not one. The count stops a backlog swamping a single
    // run; the clock stops a slow vendor doing the same. Hitting either
    // leaves the rest queued for the next hour rather than half-written.
    if (budgetExhausted(budget)) { tally.remaining++; continue; }
    budget.left--;
    await processMatch(supabase, role, match, tally, budget);
  }
}
