// Single source of truth for every DB enum that surfaces in the UI.
// Replaces the scattered `value.replace(/_/g, ' ')` pattern that was
// rendering raw enum values verbatim ("submitted", "in_progress",
// "client_admin"), which the non-tech-user audit flagged as the
// single biggest pattern of friction across both apps.
//
// Pattern: each map is `Record<DBValue, UserFacingLabel>`. Pair with
// `labelFor(map, value, fallback?)` so callers don't need null guards.
//
// This file also carries the DB enum vocabularies themselves (below).
// Migrations here are applied BY HAND, so the .sql files are not
// authority — `pg_enum` is. Three separate sites once wrote enum
// values the database did not have ('shared', 'pending_approval',
// 'handbook'), each failing at runtime with a 22P02 on a path whose
// error went to a setError() nobody read. Typing a write against the
// tuples below turns that into a compile error instead.
//
// WHEN A MIGRATION TOUCHES AN ENUM, UPDATE THE MATCHING TUPLE HERE.
// `statusMaps.test.ts` pins each label map against its tuple in both
// directions, so a label for a value that cannot exist — and a live
// value with no label — both fail the suite.

import type { CSSProperties } from 'react';

/* ─── small helper ────────────────────────────────────────────── */

export function labelFor<T extends Record<string, string>>(
  map: T,
  value: string | null | undefined,
  fallback?: string,
): string {
  if (value == null) return fallback ?? '—';
  return map[value as keyof T] ?? fallback ?? value;
}

/** `labelFor` for non-string maps (e.g. CLIENT_STATUS_STYLE).
 *
 *  The maps below are keyed by their exact enum union, which is what
 *  makes a typo a compile error. Call sites, however, read the value
 *  out of a Supabase row typed as plain `string`, so indexing directly
 *  will not typecheck. Go through this instead of widening the maps
 *  back to Record<string, …> and losing the guard. */
export function valueFor<V>(
  map: Record<string, V>,
  value: string | null | undefined,
  fallback: V,
): V {
  if (value == null) return fallback;
  return map[value] ?? fallback;
}

/* ─── Database enum vocabularies ──────────────────────────────── */
// Verified against pg_enum on the live project (sbmekaviwkiyorvmtgcu),
// 2026-08-26, after migration 078.

export const HIRING_STAGES = [
  'submitted', 'in_progress', 'shortlist_ready',
  'interview', 'offer', 'filled', 'cancelled',
] as const;
export type HiringStage = typeof HIRING_STAGES[number];

export const CANDIDATE_CLIENT_STATUSES = [
  'pending', 'shared', 'approved', 'rejected', 'info_requested', 'hired',
] as const;
export type CandidateClientStatus = typeof CANDIDATE_CLIENT_STATUSES[number];

export const DOC_CATEGORIES = [
  'contract', 'policy', 'handbook', 'letter', 'report', 'other',
] as const;
export type DocCategory = typeof DOC_CATEGORIES[number];

export const USER_ROLES = [
  'tps_admin', 'tps_client', 'client_admin', 'client_editor', 'client_user',
] as const;
export type UserRole = typeof USER_ROLES[number];

/* ─── Hiring ──────────────────────────────────────────────────── */

/** Display label for each stage in the hiring funnel. */
export const HIRING_STAGE_LABELS: Record<HiringStage, string> = {
  submitted:       'New',
  in_progress:     'Sourcing',
  shortlist_ready: 'Shortlist Ready',
  interview:       'Interviewing',
  offer:           'Offer Out',
  filled:          'Filled',
  cancelled:       'Cancelled',
};

/* ─── Candidate client status ─────────────────────────────────── */

export const CANDIDATE_CLIENT_STATUS_LABELS: Record<CandidateClientStatus, string> = {
  pending:        'Awaiting your review',
  shared:         'Shared with you',
  approved:       'Approved by you',
  rejected:       'Not the right fit',
  info_requested: 'More info requested',
  hired:          'Hired',
};

/** Badge styling per candidate status.
 *
 *  Lived in FOUR duplicated copies (the candidates list, the
 *  requisition detail page, the client-detail candidates tab and
 *  ClientDetailTabs). Only one knew about 'shared' and none knew about
 *  'hired', so those candidates rendered in grey "pending" styling on
 *  three screens out of four — wrong, but quiet enough that nobody
 *  reports it. One definition, imported everywhere. */
export const CLIENT_STATUS_STYLE: Record<CandidateClientStatus, CSSProperties> = {
  pending:        { background: 'rgba(148,163,184,0.1)', color: 'var(--slate)' },
  shared:         { background: 'rgba(59,111,255,0.1)',  color: 'var(--blue)' },
  approved:       { background: 'rgba(22,163,74,0.1)',   color: 'var(--emerald)' },
  rejected:       { background: 'rgba(220,38,38,0.1)',   color: 'var(--rose)' },
  info_requested: { background: 'rgba(217,119,6,0.1)',   color: 'var(--amber)' },
  hired:          { background: 'rgba(20,184,166,0.12)', color: 'var(--teal)' },
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

// 'compliance' was listed here for a value doc_category has never had;
// it is gone. Compliance ITEMS are a different table with a TEXT
// category — see COMPLIANCE_CATEGORY_LABELS above, which is unaffected.
export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  contract:   'Contracts',
  policy:     'Policies',
  handbook:   'Handbook',
  letter:     'Letters',
  report:     'Reports',
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

export const ROLE_LABELS: Record<UserRole, string> = {
  tps_admin:     'TPS Staff',
  tps_client:    'TPS Client',
  client_admin:  'Admin',
  client_editor: 'Editor',
  client_user:   'User',
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
