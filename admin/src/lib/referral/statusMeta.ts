// One vocabulary for the referral funnel, shared by every surface.
//
// Keep in step with the CHECK constraint on
// referral_applications.status (migration 077). A value here that the
// database refuses is a write that fails at runtime, which is the
// enum-drift bug this repo already carries elsewhere.

import type { ReferralStatus } from './types';

export interface StatusMeta {
  label:  string;
  /** Which group the funnel table shows it under. */
  group:  'rejected' | 'active' | 'downstream' | 'fault';
  /** A CSS custom property from globals.css — never a literal hex. */
  colour: string;
  /** Downstream stages an operator can advance a row to by hand. */
  manual?: boolean;
}

export const STATUS_META: Record<ReferralStatus, StatusMeta> = {
  rejected_country:    { label: 'Rejected — country',   group: 'rejected',   colour: 'var(--ink-faint)' },
  rejected_criteria:   { label: 'Rejected — criteria',  group: 'rejected',   colour: 'var(--red)' },
  rejected_score:      { label: 'Rejected — score',     group: 'rejected',   colour: 'var(--ink-faint)' },
  review_pending:      { label: 'Review queue',         group: 'active',     colour: 'var(--gold)' },
  review_rejected:     { label: 'Rejected on review',   group: 'rejected',   colour: 'var(--ink-faint)' },
  qualified:           { label: 'Qualified',            group: 'active',     colour: 'var(--blue)' },
  email_sent:          { label: 'Email sent',           group: 'active',     colour: 'var(--purple)' },
  applied_to_partner:  { label: 'Applied to partner',   group: 'downstream', colour: 'var(--purple-lt)', manual: true },
  ai_interview:        { label: 'AI interview',         group: 'downstream', colour: 'var(--purple-lt)', manual: true },
  accepted:            { label: 'Accepted',             group: 'downstream', colour: 'var(--teal)',      manual: true },
  ten_hours_completed: { label: '10 hours completed',   group: 'downstream', colour: 'var(--teal)',      manual: true },
  fee_due:             { label: 'Referral fee due',     group: 'downstream', colour: 'var(--gold)',      manual: true },
  paid:                { label: 'Paid',                 group: 'downstream', colour: 'var(--teal)',      manual: true },
  scan_error:          { label: 'Scan error',           group: 'fault',      colour: 'var(--red)' },
};

export const ALL_STATUSES = Object.keys(STATUS_META) as ReferralStatus[];

/** Statuses an operator may set by hand from the funnel table. Excludes
 *  everything the pipeline owns — a human moving a row back to
 *  'qualified' would make the idempotency guard and the email record
 *  disagree about whether anyone was contacted. */
export const MANUAL_STATUSES = ALL_STATUSES.filter(s => STATUS_META[s].manual);

export function statusLabel(s: string): string {
  return (STATUS_META as Record<string, StatusMeta>)[s]?.label ?? s;
}

export function statusColour(s: string): string {
  return (STATUS_META as Record<string, StatusMeta>)[s]?.colour ?? 'var(--ink-faint)';
}

export const SCAN_SOURCE_LABEL: Record<string, string> = {
  cv_pdf:         'Full CV',
  manatal_parsed: 'Parsed data only',
};
