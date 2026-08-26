// Candidate scoring via IvyLens.
//
// Wraps the existing ivylensRequest() helper (retry, Bearer auth,
// /api/partner prefix, telemetry into ivylens_api_calls) rather than
// re-implementing any of it.
//
// Endpoint: POST /api/partner/scans/run
// Partner scope required: candidate_scan.run
//
// ⚠ CALIBRATION CAVEAT, worth knowing before trusting a threshold.
// The partner path returns the RAW model score. IvyLens's internal
// Candidate Match blends it with a deterministic keyword-overlap
// anchor (0.35 objective + 0.65 AI); the partner endpoint does not.
// IvyLens's own docs/CANDIDATE_MATCH_MODEL.md records that this
// scorer is unreliable at the margins.
//
// That is precisely why referral_role_config.dry_run defaults to
// true: 85/75 are starting guesses, and the score distribution has to
// be looked at before any of it goes live.

import { ivylensRequest } from '../ivylens';
import type { ScanResult } from './types';

export interface RunScanResponse extends ScanResult {
  scan_id?:      string;
  candidate_id?: string;
  role_id?:      string;
  status?:       string;
}

export interface ScanRequest {
  candidateText: string;
  /** Preferred: the stable friction_lens_roles id from a prior
   *  /api/partner/roles/analyze call, stored on
   *  requisitions.ivylens_role_id. Cheaper and more consistent than
   *  re-sending the JD text on every candidate. */
  roleId?:   string | null;
  /** Fallback when the requisition has no ivylens_role_id yet. */
  roleText?: string | null;
  /** Absolute epoch-ms ceiling, so a slow vendor cannot push the batch
   *  past the cron's maxDuration and lose everything after it. */
  deadline?: number;
}

export interface ScanOutcome {
  scan:  RunScanResponse | null;
  error: string | null;
  status: number;
}

/** Score one candidate against one role.
 *
 *  Returns an outcome rather than throwing, because the caller runs a
 *  batch: one unscoreable candidate must be recorded as scan_error and
 *  stepped over, not allowed to abort the run. */
export async function runCandidateScan(req: ScanRequest): Promise<ScanOutcome> {
  const candidateText = (req.candidateText ?? '').trim();

  // An empty body would be scored — as near zero — and look exactly
  // like a genuinely poor candidate. Refuse it instead so it lands as
  // a visible fault.
  if (!candidateText) {
    return { scan: null, error: 'No candidate text to scan (CV unreadable and no parsed data available).', status: 400 };
  }
  if (!req.roleId && !(req.roleText ?? '').trim()) {
    return { scan: null, error: 'Role has neither an ivylens_role_id nor any JD text to scan against.', status: 400 };
  }

  const body: Record<string, unknown> = { candidate_text: candidateText };
  if (req.roleId) body.role_id = req.roleId;
  else            body.role_text = req.roleText;

  const res = await ivylensRequest<RunScanResponse>('/scans/run', {
    method:  'POST',
    body,
    timeout: 45_000,
    retries: 2,
    // Background job: waiting out a rate limit beats losing the
    // candidate. Bounded by the run deadline the cron passes down.
    waitOutRateLimit: true,
    deadline: req.deadline,
  });

  if (!res.data) {
    return {
      scan:  null,
      error: res.rate_limited
        ? `IvyLens rate limited the scan (HTTP ${res.status}).`
        : (res.error ?? `IvyLens scan failed (HTTP ${res.status}).`),
      status: res.status,
    };
  }

  // A 200 carrying no score is not a score of zero. Treat it as the
  // fault it is rather than rejecting the candidate on it.
  if (typeof res.data.overall_score !== 'number' || !Number.isFinite(res.data.overall_score)) {
    return {
      scan:   null,
      error:  'IvyLens returned a response with no usable overall_score.',
      status: res.status,
    };
  }

  return { scan: res.data, error: null, status: res.status };
}
