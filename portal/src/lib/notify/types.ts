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
  'service_request_updated',
  'service_request_completed',
  'sla_breached',
  'client_at_risk',
  'ivylens_ticket_reply',
  'ivylens_ticket_resolved',
  // BD
  'enquiry_received',
  // News / regulatory
  'regulatory_change_detected',
  // Actions and internal tasks
  'action_completed',
  'task_assigned',
  'task_due',
  // Billing
  'payment_failed',
  // PROTECT / compliance
  'compliance_due_soon',
  'compliance_overdue',
  'hs_document_review_due',
  // LEAD / HR reminders
  'document_review_due',
  'employee_document_expiring',
  'employee_document_expired',
  'training_record_expiring',
  'training_record_expired',
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
  'hs_audit_completed',
  'hs_incident_reported',
  'hs_incident_status_changed',
  'hs_document_added',
  'hs_equipment_inspection_due',
  'hs_test_result',
  // Core-OS 360 Phase 4 (145): the asset inspection engine.
  'inspection_completed',
  // Core-OS 360 Phase 4 (148): PUWER assessments.
  'puwer_review_due',
  // Core-OS 360 Phase 4 (149): LOLER immediate danger.
  'loler_immediate_danger',
  // Core-OS 360 Phase 4 (150): contractors.
  'contractor_status_changed',
  'contractor_insurance_expiring',
  // Core-OS 360 Phase 4 (152): permit to work.
  'permit_status_changed',
  'permit_expiring',
  // Core-OS 360 Phase 4 (153): isolation / LOTO.
  'isolation_applied',
  // Core-OS 360 Phase 4 (154): emergency planning.
  'emergency_plan_review_due',
  'emergency_drill_recorded',
  'emergency_plan_added',
  // Core-OS 360 Phase 4 Group 12 wiring sweep: PUWER had a trigger
  // but no consuming rule beyond its review-cycle reminder.
  'puwer_assessment_recorded',
  // Core-OS 360 Phase 5 Group 1 (156): environmental aspects & impacts.
  'environmental_aspect_significant',
  // Core-OS 360 Phase 5 Group 2 (157): incidents, spills, waste,
  // monitoring, permits & conditions.
  'environmental_spill_reported',
  'waste_non_conformance',
  'environmental_monitoring_exceedance',
  'environmental_permit_status_changed',
  'environmental_permit_condition_review',
  // Core-OS 360 Phase 5 Group 3 (158): shared ISO 45001/14001
  // management-system framework. Never "compliant"/"certified" — a
  // real user-entered certificate's own recorded expiry.
  'iso_certification_expiring',
  'iso_certification_expired',
  // Core-OS 360 Phase 5 Group 4 (159): the Legal Register. Never
  // "compliant"/"non-compliant"/"legal"/"illegal" — see CLAUDE.md's
  // standing rule against certification/compliance-verdict language.
  'legal_obligation_applicable',
  'legal_evaluation_recorded',
  'legal_evaluation_noncompliance',
  'legal_obligation_review_due',
  // Core-OS 360 Phase 5 Group 5 (160): Controlled Document Management —
  // the formal author/reviewer/approver workflow's own transitions.
  // 'hs_document_added' (below) still covers a document reaching
  // 'active' (published); these cover the steps before that.
  'hs_document_submitted_for_review',
  'hs_document_submitted_for_approval',
  'hs_document_approved',
  'hs_document_withdrawn',
  // Core-OS 360 Phase 5 Group 6 (161): Objectives & Targets, and
  // Management Review. Never a compliance verdict — a factual progress
  // status ('at_risk'/'missed') or a recorded review milestone.
  'objective_at_risk',
  'objective_missed',
  'objective_achieved',
  'management_review_due',
  'management_review_completed',
  // Core-OS 360 Phase 5, Group 7 (162): Internal Audit Enhancement,
  // Worker Consultation, Environmental Complaints.
  'audit_finding_raised',
  'audit_finding_closed',
  'audit_programme_due',
  'consultation_recorded',
  'environmental_complaint_received',
  'environmental_complaint_updated',
  // PROTECT / operational safety core (Phase 2)
  'hazard_reported',
  'hazard_assigned',
  'safety_doc_review_requested',
  'safety_doc_decided',
  'safety_doc_review_due',
  'hs_incident_escalated',
  'riddor_review_required',
  'investigation_assigned',
  'investigation_submitted',
  'investigation_decided',
  'investigation_overdue',
  'action_assigned',
  'action_verification_requested',
  'action_verification_rejected',
  'action_overdue',
  // Core-OS 360 Phase 3: workforce
  'workforce_not_ready',
  'workforce_evidence_expiring',
  'workforce_exception_lapsing',
  'occupational_health_review_due',
  // LEAD / HR flow
  'leave_requested',
  'role_filled',
  'onboarding_started',
  'onboarding_risk',
  'probation_review_scheduled',
  'offboarding_started',
  'employee_left',
  'document_uploaded',
  'document_shared',
  'document_approved',
  'absence_pattern_flag',
  'policy_ack_signed',
  'policy_ack_needs_email',
  // HIRE flow
  'role_stage_changed',
  'candidate_shared',
  'interview_scheduled',
  'interview_cancelled',
  'offer_sent',
  'offer_decided',
  'role_stale',
  'offer_deadline',
  'referral_review_pending',
  'referral_scan_failed',
  // Core-OS 360 Phase 7, Group 6: a report's own next_visit_
  // recommended_date approaching/passed with no follow-up visit yet
  // booked for that client.
  'consultancy_followup_due',
  // Core-OS 360 Phase 13, Group 1: a board assurance report moved from
  // draft to issued — the client's own board can now read and
  // acknowledge it.
  'board_assurance_report_issued',
  // Core-OS 360 Phase 16, Group 2: a staff-curated, anonymised lesson
  // learned at another client was shared with this one.
  'lesson_learned_published',
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  general:                    'General',
  role_pending_approval:      'Role awaiting approval',
  candidate_stage_move:       'Candidate moved stage',
  candidate_feedback:         'Candidate feedback',
  service_request_created:    'Service request raised',
  service_request_overdue:    'Service request overdue',
  service_request_updated:    'Service request in progress',
  service_request_completed:  'Service request completed',
  sla_breached:               'Response overdue (SLA)',
  client_at_risk:             'Client may be unhappy',
  enquiry_received:           'New enquiry',
  regulatory_change_detected: 'Possible regulatory change',
  ivylens_ticket_reply:       'Support reply',
  ivylens_ticket_resolved:    'Support ticket resolved',
  action_completed:           'Action completed',
  task_assigned:              'Task assigned',
  task_due:                   'Task due',
  payment_failed:             'Payment failed',
  compliance_due_soon:        'Compliance due soon',
  compliance_overdue:         'Compliance overdue',
  hs_document_review_due:     'H&S document review due',
  document_review_due:        'Document review due',
  employee_document_expiring: 'Employee document expiring',
  employee_document_expired:  'Employee document expired',
  training_record_expiring:  'Training record expiring',
  training_record_expired:   'Training record expired',
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
  hs_audit_completed:         'H&S audit completed',
  hs_incident_reported:       'H&S incident recorded',
  hs_incident_status_changed: 'H&S incident investigation updated',
  hs_document_added:          'New H&S document',
  hs_test_result:             'Test result recorded',
  hazard_reported:               'Hazard reported',
  hazard_assigned:               'Hazard assigned to you',
  safety_doc_review_requested:   'Safety document ready for review',
  safety_doc_decided:            'Safety document decision',
  safety_doc_review_due:         'Safety document review due',
  hs_incident_escalated:         'Incident escalated',
  riddor_review_required:        'RIDDOR review needed',
  investigation_assigned:        'Investigation assigned to you',
  investigation_submitted:       'Investigation ready for approval',
  investigation_decided:         'Investigation decision',
  investigation_overdue:         'Investigation overdue',
  action_assigned:               'Action assigned to you',
  action_verification_requested: 'Action awaiting your verification',
  action_verification_rejected:  'Action not verified',
  action_overdue:                'Action overdue',
  workforce_not_ready:            'No longer ready to deploy',
  workforce_evidence_expiring:    'Workforce evidence expiring',
  workforce_exception_lapsing:    'Deployment exception ending',
  occupational_health_review_due: 'Occupational health review due',
  hs_equipment_inspection_due: 'Equipment inspection due',
  inspection_completed:       'Asset inspection completed',
  puwer_review_due:           'PUWER review due',
  loler_immediate_danger:     'LOLER immediate danger recorded',
  contractor_status_changed:    'Contractor status changed',
  contractor_insurance_expiring: 'Contractor insurance expiring',
  permit_status_changed:      'Permit status changed',
  permit_expiring:            'Permit expiring',
  isolation_applied:          'Isolation applied',
  emergency_plan_review_due: 'Emergency plan review due',
  emergency_drill_recorded:  'Emergency drill recorded',
  emergency_plan_added:      'Emergency plan added',
  puwer_assessment_recorded: 'PUWER assessment recorded',
  environmental_aspect_significant: 'Environmental aspect confirmed significant',
  environmental_spill_reported:    'Environmental spill reported',
  waste_non_conformance:           'Waste movement non-conformance',
  environmental_monitoring_exceedance: 'Environmental monitoring exceedance',
  environmental_permit_status_changed: 'Environmental permit status changed',
  environmental_permit_condition_review: 'Environmental permit condition needs review',
  iso_certification_expiring: 'ISO certification expiring',
  iso_certification_expired:  'ISO certification expired',
  legal_obligation_applicable:   'Legal requirement marked applicable',
  legal_evaluation_recorded:     'Legal evaluation recorded',
  legal_evaluation_noncompliance:'Legal register: non-compliance recorded',
  legal_obligation_review_due:   'Legal register review due',
  hs_document_submitted_for_review:   'H&S document submitted for review',
  hs_document_submitted_for_approval: 'H&S document submitted for approval',
  hs_document_approved:               'H&S document approved',
  hs_document_withdrawn:              'H&S document withdrawn',
  objective_at_risk:          'Objective at risk',
  objective_missed:           'Objective missed',
  objective_achieved:         'Objective achieved',
  management_review_due:      'Management review due',
  management_review_completed:'Management review completed',
  audit_finding_raised:              'Audit finding raised',
  audit_finding_closed:              'Audit finding closed',
  audit_programme_due:               'Planned audit due',
  consultation_recorded:             'Worker consultation recorded',
  environmental_complaint_received:  'Environmental complaint received',
  environmental_complaint_updated:   'Environmental complaint updated',
  leave_requested:            'Leave requested',
  role_filled:                'Role filled',
  onboarding_started:         'Onboarding started',
  onboarding_risk:            'Onboarding slipping',
  probation_review_scheduled: 'Probation review scheduled',
  offboarding_started:        'Offboarding started',
  employee_left:              'Employee left',
  document_uploaded:          'Client uploaded a document',
  document_shared:            'Document shared with you',
  document_approved:          'Document approved',
  absence_pattern_flag:       'Absence pattern to review',
  policy_ack_signed:          'Policy acknowledged',
  policy_ack_needs_email:     'Policy link could not be sent',
  role_stage_changed:         'Role moved stage',
  candidate_shared:           'Candidate shared with you',
  interview_scheduled:        'Interview booked',
  interview_cancelled:        'Interview cancelled',
  offer_sent:                 'Offer sent',
  offer_decided:              'Offer decision',
  role_stale:                 'Role has stalled',
  offer_deadline:             'Offer deadline',
  referral_review_pending:    'Referrals awaiting review',
  referral_scan_failed:       'Referral scan failed',
  consultancy_followup_due:   'Follow-up visit due',
  board_assurance_report_issued: 'Board assurance report issued',
  lesson_learned_published:   'New lesson learned shared with you',
};

export function isNotificationType(v: string): v is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

/** Email delivery preference. `daily` = one digest a morning; a rule
 *  may still mark a consequence urgent, which emails a `daily` user at
 *  once. `off` = in-app only. */
export const EMAIL_MODES = ['immediate', 'daily', 'off'] as const;
export type EmailMode = typeof EMAIL_MODES[number];

/** Core-OS 360 Completion Programme, Phase 25, Group 5 (C9.5). A
 *  scheduled "What Changed?" digest for a client's own organisation —
 *  'off' by default (migration 193): a brand-new digest nobody has
 *  asked for yet is explicit opt-in, not a surprise new email. */
export const WHAT_CHANGED_DIGEST_MODES = ['off', 'daily', 'weekly'] as const;
export type WhatChangedDigestMode = typeof WHAT_CHANGED_DIGEST_MODES[number];

export interface NotificationPreferences {
  user_id:              string;
  email_mode:            EmailMode;
  muted_types:           string[];
  weekly_summary:        boolean;
  what_changed_digest:   WhatChangedDigestMode;
}
