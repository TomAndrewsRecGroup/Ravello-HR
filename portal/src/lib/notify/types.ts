// The notification vocabulary, one list for both apps (shared-dupe pair).
//
// Every `notifications.type` written anywhere is one of these, and each
// bell's icon map is pinned against the tuple in BOTH directions by
// notificationTypes.test.ts. The admin bell used to carry nine types no
// code ever wrote (ticket_escalated, user_invited, broadcast, …) — a
// list of things somebody once meant to build — and the portal bell
// four more. A type here is one a rule in lib/events/rules.ts or a
// route actually produces.

export const NOTIFICATION_TYPES = [
  'general',
  // HIRE
  'role_pending_approval',
  'candidate_stage_move',
  'candidate_feedback',
  // Support
  'service_request_created',
  'service_request_overdue',
  'ivylens_ticket_reply',
  'ivylens_ticket_resolved',
  // Actions and internal tasks
  'action_completed',
  'task_assigned',
  'task_due',
  // Billing
  'payment_failed',
  // PROTECT / compliance
  'compliance_due_soon',
  'compliance_overdue',
  // LEAD / HR reminders
  'document_review_due',
  'employee_document_expiring',
  'employee_document_expired',
  'policy_ack_overdue',
  'review_due',
  'checklist_task_due',
  'probation_ending',
  'absence_pending',
  // PROTECT / Health & Safety
  'hs_check_failed',
  'hs_actions_raised',
  'hs_activity_logged',
  'hs_evidence_added',
  'hs_item_added',
  'hs_action_done',
  'hs_followup_suggested',
  'provider_access_ending',
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  general:                    'General',
  role_pending_approval:      'Role awaiting approval',
  candidate_stage_move:       'Candidate moved stage',
  candidate_feedback:         'Candidate feedback',
  service_request_created:    'Service request raised',
  service_request_overdue:    'Service request overdue',
  ivylens_ticket_reply:       'Support reply',
  ivylens_ticket_resolved:    'Support ticket resolved',
  action_completed:           'Action completed',
  task_assigned:              'Task assigned',
  task_due:                   'Task due',
  payment_failed:             'Payment failed',
  compliance_due_soon:        'Compliance due soon',
  compliance_overdue:         'Compliance overdue',
  document_review_due:        'Document review due',
  employee_document_expiring: 'Employee document expiring',
  employee_document_expired:  'Employee document expired',
  policy_ack_overdue:         'Policy acknowledgement overdue',
  review_due:                 'Performance review due',
  checklist_task_due:         'Onboarding / offboarding task due',
  probation_ending:           'Probation ending',
  absence_pending:            'Leave request awaiting decision',
  hs_check_failed:            'H&S check failed',
  hs_actions_raised:          'H&S check passed with actions',
  hs_activity_logged:         'H&S activity logged',
  hs_evidence_added:          'H&S evidence added',
  hs_item_added:              'H&S register item added',
  hs_action_done:             'H&S action completed',
  hs_followup_suggested:      'H&S follow-up suggested',
  provider_access_ending:     'Provider access ending',
};

export function isNotificationType(v: string): v is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

/** Email delivery preference. `daily` = one digest a morning; a rule
 *  may still mark a consequence urgent, which emails a `daily` user at
 *  once. `off` = in-app only. */
export const EMAIL_MODES = ['immediate', 'daily', 'off'] as const;
export type EmailMode = typeof EMAIL_MODES[number];

export interface NotificationPreferences {
  user_id:        string;
  email_mode:     EmailMode;
  muted_types:    string[];
  weekly_summary: boolean;
}
