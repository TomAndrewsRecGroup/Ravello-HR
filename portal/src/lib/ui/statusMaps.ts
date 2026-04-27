// Single source of truth for every DB enum that surfaces in the UI.
// Replaces the scattered `value.replace(/_/g, ' ')` pattern that was
// rendering raw enum values verbatim ("submitted", "in_progress",
// "client_admin"), which the non-tech-user audit flagged as the
// single biggest pattern of friction across both apps.
//
// Pattern: each map is `Record<DBValue, UserFacingLabel>`. Pair with
// `labelFor(map, value, fallback?)` so callers don't need null guards.

/* ─── small helper ────────────────────────────────────────────── */

export function labelFor<T extends Record<string, string>>(
  map: T,
  value: string | null | undefined,
  fallback?: string,
): string {
  if (value == null) return fallback ?? '—';
  return map[value as keyof T] ?? fallback ?? value;
}

/* ─── Hiring ──────────────────────────────────────────────────── */

/** Display label for each stage in the hiring funnel. */
export const HIRING_STAGE_LABELS: Record<string, string> = {
  submitted:       'New',
  in_progress:     'Sourcing',
  shortlist_ready: 'Shortlist Ready',
  interview:       'Interviewing',
  offer:           'Offer Out',
  filled:          'Filled',
  cancelled:       'Cancelled',
};

/* ─── Candidate client status ─────────────────────────────────── */

export const CANDIDATE_CLIENT_STATUS_LABELS: Record<string, string> = {
  pending:  'Awaiting your review',
  shared:   'Shared with you',
  approved: 'Approved by you',
  rejected: 'Not the right fit',
};

/* ─── Compliance ──────────────────────────────────────────────── */

export const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  pending:    'Not started',
  in_review:  'In progress',
  in_progress:'In progress',
  complete:   'Done',
  completed:  'Done',
  overdue:    'Overdue',
};

export const COMPLIANCE_CATEGORY_LABELS: Record<string, string> = {
  contract:     'Contracts',
  policy:       'Policies',
  handbook:     'Handbook',
  training:     'Training',
  health_safety:'Health & Safety',
  data:         'Data Protection',
  hr:           'HR',
  other:        'Other',
};

/** RAG (Red / Amber / Green) — used in the cross-client compliance dashboard. */
export const RAG_LABELS: Record<string, string> = {
  red:      'Overdue',
  amber:    'Due soon',
  green:    'On track',
  complete: 'Done',
};

/* ─── Tickets ─────────────────────────────────────────────────── */

export const TICKET_STATUS_LABELS: Record<string, string> = {
  open:        'Open',
  in_progress: 'In progress',
  resolved:    'Resolved',
  closed:      'Closed',
};

/** Tailwind class fragment for the ticket-status badge. */
export const TICKET_STATUS_BADGE: Record<string, string> = {
  open:        'badge-open',
  in_progress: 'badge-inprogress',
  resolved:    'badge-resolved',
  closed:      'badge-normal',
};

export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low:    'Low',
  normal: 'Normal',
  high:   'High',
  urgent: 'Urgent',
};

/* ─── Service requests ────────────────────────────────────────── */

export const SERVICE_REQUEST_STATUS_LABELS: Record<string, string> = {
  open:        'New',
  in_progress: 'In progress',
  awaiting:    'Awaiting your reply',
  resolved:    'Resolved',
  closed:      'Closed',
};

/* ─── Actions ─────────────────────────────────────────────────── */

export const ACTION_STATUS_LABELS: Record<string, string> = {
  pending:     'To do',
  in_progress: 'In progress',
  done:        'Done',
  dismissed:   'Snoozed',
};

export const ACTION_PRIORITY_LABELS: Record<string, string> = {
  low:    'Low',
  normal: 'Normal',
  high:   'High',
  urgent: 'Urgent',
};

/** Broadcast / action type — used in the admin broadcast composer. */
export const ACTION_TYPE_LABELS: Record<string, string> = {
  compliance_update:   'Compliance update',
  policy_change:       'Policy change',
  document_review:     'Document review',
  training_required:   'Training required',
  information_request: 'Information request',
  deadline_reminder:   'Deadline reminder',
  general:             'General',
};

/* ─── Absence ─────────────────────────────────────────────────── */

export const ABSENCE_TYPE_LABELS: Record<string, string> = {
  holiday:         'Annual leave',
  annual:          'Annual leave',
  sick:            'Sick leave',
  maternity:       'Maternity leave',
  paternity:       'Paternity leave',
  shared_parental: 'Shared parental leave',
  compassionate:   'Compassionate leave',
  unpaid:          'Unpaid leave',
  other:           'Other',
};

export const ABSENCE_STATUS_LABELS: Record<string, string> = {
  pending:   'Awaiting approval',
  approved:  'Approved',
  rejected:  'Declined',
  cancelled: 'Cancelled',
};

/* ─── Employee documents ──────────────────────────────────────── */

export const EMPLOYEE_DOC_TYPE_LABELS: Record<string, string> = {
  contract:        'Contract',
  right_to_work:   'Right to Work',
  dbs_check:       'DBS Check',
  visa:            'Visa / Work Permit',
  offer_letter:    'Offer Letter',
  nda:             'NDA',
  disciplinary:    'Disciplinary record',
  grievance:       'Grievance record',
  absence_record:  'Absence record',
  other:           'Other',
};

/* ─── Document categories (company-wide docs) ─────────────────── */

export const DOC_CATEGORY_LABELS: Record<string, string> = {
  contract:   'Contracts',
  policy:     'Policies',
  handbook:   'Handbook',
  compliance: 'Compliance',
  report:     'Reports',
  letter:     'Letters',
  other:      'Other',
};

/* ─── Performance review types ────────────────────────────────── */

export const REVIEW_TYPE_LABELS: Record<string, string> = {
  annual:     'Annual review',
  quarterly:  'Quarterly check-in',
  probation:  'Probation review',
  '90_day':   '90-day review',
  ad_hoc:     'Ad-hoc review',
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  scheduled:  'Scheduled',
  in_progress:'In progress',
  complete:   'Complete',
  completed:  'Complete',
  cancelled:  'Cancelled',
};

/* ─── User roles (UI labels, never expose the raw enum) ───────── */

export const ROLE_LABELS: Record<string, string> = {
  client_admin:  'Admin',
  client_editor: 'Editor',
  tps_admin:     'TPS Staff',
};

/* ─── Athletes To Industry interest status ────────────────────── */

export const INTEREST_STATUS_LABELS: Record<string, string> = {
  interested:  'Interested',
  introduced:  'Introduced',
  passed:      'Not pursuing',
};

/* ─── Portal sub-user role values that the invite/API validates ── */

/** Whitelist of role values the portal will accept on invite. */
export const PORTAL_INVITE_ROLES = ['client_admin', 'client_editor'] as const;
export type PortalInviteRole = typeof PORTAL_INVITE_ROLES[number];
