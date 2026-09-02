// Shared types for the referral pipeline.
//
// Kept separate from gate.ts so the gate stays free of any import
// that could drag I/O into a module that must remain pure.

/** One mandatory requirement for a role. A candidate must show
 *  positive evidence of EVERY criterion or they are rejected,
 *  whatever their match score. */
export interface MandatoryCriterion {
  /** Stable key, e.g. 'mcp_experience'. */
  key:   string;
  /** Human label shown in the review queue, e.g. 'MCP implementation experience'. */
  label: string;
  /** Any one of these matching a found skill satisfies the criterion.
   *  Matched case-insensitively as a substring in either direction, so
   *  'MCP' matches 'MCP server development' and 'Model Context Protocol'
   *  matches 'Model Context Protocol (MCP)'. */
  match_terms: string[];
}

export interface ReferralRoleConfig {
  requisition_id:      string;
  enabled:             boolean;
  dry_run:             boolean;
  /** Who the candidate is referred TO, e.g. 'Micro1'. */
  partner_name:        string;
  referral_url:        string;
  email_process_note?: string | null;
  auto_send_threshold: number;
  review_threshold:    number;
  /** Countries to REFUSE. Empty blocks nobody — see gate.ts. */
  blocked_countries:   string[];
  mandatory_criteria:  MandatoryCriterion[];
}

/** One entry of the IvyLens scan response's skill_matches[]. */
export interface ScanSkillMatch {
  skill:      string;
  required?:  boolean;
  found?:     boolean;
  confidence?: number;
}

/** The subset of IvyLens's RunScanResponse the gate reads. */
export interface ScanResult {
  scan_id?:            string;
  /** 0.0 - 1.0 float, as IvyLens returns it. Converted to 0-100 here. */
  overall_score:       number;
  strengths?:          string[];
  gaps?:               string[];
  skill_matches?:      ScanSkillMatch[];
  experience_analysis?: string;
}

/** `clear` = readable and not blocked. `blocked` = named a country on
 *  the list. `unknown` = no country could be read — not blocked, but
 *  never auto-sent (see gate.ts).
 *
 *  `approved` / `rejected` are PRE-084 history. Rows written under the
 *  old allow list keep their own words: "was not on the allow list" is
 *  not the same fact as "is on the block list", and relabelling them
 *  would assert something never measured. Readers must handle all five;
 *  only the first three are ever written now. */
export type CountryGateResult =
  | 'clear' | 'blocked' | 'unknown'
  | 'approved' | 'rejected';

export type ReferralStatus =
  | 'rejected_country'
  | 'rejected_criteria'
  | 'rejected_score'
  | 'review_pending'
  | 'review_rejected'
  | 'qualified'
  | 'email_sent'
  | 'applied_to_partner'
  | 'ai_interview'
  | 'accepted'
  | 'ten_hours_completed'
  | 'fee_due'
  | 'paid'
  | 'scan_error';

export type ScanSource = 'cv_pdf' | 'manatal_parsed';

export interface FailedCriterion {
  key:    string;
  label:  string;
  /** Why it failed, in words fit to show in the review queue. */
  reason: string;
}
