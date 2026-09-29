// Core-OS 360 Phase 6 (Laws Safety Consultant Command Centre) vocabulary.
// Each tuple mirrors a CHECK constraint in migration 168; vocab.test.ts
// reads the SQL and fails if either side gains a value the other lacks —
// the same statusMaps discipline lib/hs/vocab.ts already follows.

export const SERVICE_TYPES = [
  'retained_hs_consultancy', 'audit_support', 'iso_support', 'training',
  'incident_support', 'document_management', 'occupational_health_coordination', 'recruitment',
] as const;
export type ServiceType = typeof SERVICE_TYPES[number];
export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  retained_hs_consultancy:          'Retained H&S consultancy',
  audit_support:                    'Audit support',
  iso_support:                      'ISO support',
  training:                         'Training',
  incident_support:                 'Incident support',
  document_management:              'Document management',
  occupational_health_coordination: 'Occupational health coordination',
  recruitment:                      'Recruitment',
};

export const SERVICE_SCOPE_STATUSES = ['active', 'paused', 'ended'] as const;
export type ServiceScopeStatus = typeof SERVICE_SCOPE_STATUSES[number];
export const SERVICE_SCOPE_STATUS_LABELS: Record<ServiceScopeStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  ended:  'Ended',
};

export const REVIEW_FREQUENCIES = ['monthly', 'quarterly', 'biannual', 'annual'] as const;
export type ReviewFrequency = typeof REVIEW_FREQUENCIES[number];
export const REVIEW_FREQUENCY_LABELS: Record<ReviewFrequency, string> = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  biannual:  'Biannual',
  annual:    'Annual',
};

// consultancy_visits is deliberately minimal — Phase 7 (Consultant Visit
// Mode & Automated Site-Visit Reporting) owns the full workflow and
// EXTENDS this table; see migration 168's own header comment.
export const VISIT_TYPES = [
  'retained_visit', 'audit_visit', 'incident_support', 'training_delivery', 'management_review_support', 'other',
] as const;
export type VisitType = typeof VISIT_TYPES[number];
export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  retained_visit:             'Retained visit',
  audit_visit:                'Audit visit',
  incident_support:           'Incident support',
  training_delivery:          'Training delivery',
  management_review_support:  'Management review support',
  other:                      'Other',
};

export const VISIT_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type VisitStatus = typeof VISIT_STATUSES[number];
export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
