// One referral scan, however it was triggered.
//
// This was the body of the hourly cron route. It moved here on
// 2026-09-04 during the SAME investigation that found the cron
// 307-redirect bug (see CLAUDE.md, "Every cron and the Stripe webhook
// were 307-redirected to login") — at that moment Vercel's own Cron
// Jobs dashboard for the admin project showed no history for these
// schedules, which briefly looked like `admin/vercel.json` had never
// been read at all. It had: the requests were firing and hitting the
// middleware's login redirect before ever reaching this code, which is
// exactly what a hosting-level cron log cannot distinguish from "never
// scheduled". **This turned out to be the wrong diagnosis** — corrected
// here 2026-09-30 (Phase 20 audit) after the schedules' own subsequent
// history (the duplicate-email incident and everything since) proved
// the crons have run on schedule since the actual fix landed the same
// day. Left uncorrected for 26 days, this comment would have told the
// next reader the opposite of what the rest of this file's own
// operational history shows.
//
// The extraction itself was still the right call, for a reason that
// has nothing to do with the misdiagnosis above: a pipeline whose only
// trigger was a schedule nobody could directly invoke had no way to be
// re-run on demand or tested by hand. There are now two callers of ONE
// implementation: the cron, and an operator-triggered route
// (`api/admin/requisitions/[id]/scan-applicants`) for re-running a
// single role on demand.
//
// Deliberately ONE implementation. A second copy of the gating loop is
// the copy nobody re-checks when a skip reason changes, and every
// decision this makes is about whether to email a stranger.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_BATCH_CAP,
  RUN_BUDGET_MS,
  emptyTally,
  processRole,
  type RoleRow,
  type Tally,
} from './pipeline';
import { breakerSnapshot } from '@/lib/http/resilient';

export interface ScanResultPayload extends Tally {
  ran_at: string;
  cap: number;
}

export interface ScanOutcome {
  payload:   ScanResultPayload;
  unhealthy: boolean;
  /** Null when the roles could not be read at all. */
  error:     string | null;
}

/** The role query, shared so both callers scan exactly the same set. */
const ROLE_SELECT = `
  requisition_id, enabled, dry_run, partner_name, referral_url, email_process_note,
  auto_send_threshold, review_threshold, blocked_countries, mandatory_criteria,
  requisition:requisitions!inner (
    id, title, company_id, manatal_job_id, ivylens_role_id, jd_text, description
  )
`;

export async function runReferralScan(
  supabase: SupabaseClient,
  opts?: { cap?: number; requisitionId?: string },
): Promise<ScanOutcome> {
  const ranAt = new Date().toISOString();
  const requested = opts?.cap ?? DEFAULT_BATCH_CAP;
  const cap = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 200)
    : DEFAULT_BATCH_CAP;

  let query = supabase.from('referral_role_config').select(ROLE_SELECT).eq('enabled', true);
  // An operator re-running one role must not re-scan every other role's
  // applicants and spend their share of the batch cap.
  if (opts?.requisitionId) query = query.eq('requisition_id', opts.requisitionId);

  const { data: roles, error } = await query;
  const tally = emptyTally();

  if (error) {
    return {
      payload: { ran_at: ranAt, cap, ...tally },
      unhealthy: true,
      error: error.message,
    };
  }

  if (!roles?.length) {
    return { payload: { ran_at: ranAt, cap, ...tally }, unhealthy: false, error: null };
  }

  // Two ceilings: a candidate count and a wall clock. Being killed
  // mid-write loses the tally, which is what turns "0 emailed" into a
  // mystery rather than a number.
  const budget = { left: cap, deadline: Date.now() + RUN_BUDGET_MS };

  // Sequential on purpose: the roles share one Manatal rate-limit
  // budget, one IvyLens partner key, and one global batch cap.
  for (const raw of roles) {
    // PostgREST types an !inner embed as an array; it is one row.
    const requisition = Array.isArray((raw as any).requisition)
      ? (raw as any).requisition[0]
      : (raw as any).requisition;
    if (!requisition) {
      tally.roles_skipped++;
      tally.notes.push('A referral config had no matching requisition and was skipped.');
      continue;
    }
    try {
      await processRole(supabase, { ...(raw as any), requisition } as RoleRow, tally, budget);
    } catch (err) {
      // One bad role must not take the rest of the run with it.
      tally.roles_skipped++;
      tally.notes.push(`Role "${requisition.title}" failed: ${(err as Error)?.message}`);
    }
  }

  // Judged over ATTEMPTED candidates only: a quiet hour with nothing to
  // do is a healthy zero, not a failure.
  const attempted = tally.scanned + tally.scan_errors;
  const unhealthy =
    (attempted > 0 && tally.scan_errors / attempted > 0.5) ||
    (tally.roles_considered === 0 && tally.roles_skipped > 0);

  tally.vendor_breakers = breakerSnapshot();

  return {
    payload: { ran_at: ranAt, cap, ...tally },
    unhealthy,
    error: null,
  };
}
