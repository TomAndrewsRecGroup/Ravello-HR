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

// consultancy_visits started deliberately minimal (168's own header
// comment) — Phase 7 (Consultant Visit Mode & Automated Site-Visit
// Reporting) EXTENDS it in place (migration 173), never a parallel
// table.
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

// Migration 173 (Phase 7, Group 1) replaced 168's original 3-value
// status with the full visit lifecycle the spec names — 0 live rows
// existed, so the CHECK was tightened directly rather than kept
// permissive for values nothing ever wrote.
export const VISIT_STATUSES = [
  'planned', 'confirmed', 'in_progress', 'awaiting_report', 'report_draft', 'report_issued', 'closed', 'cancelled',
] as const;
export type VisitStatus = typeof VISIT_STATUSES[number];
export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  planned:         'Planned',
  confirmed:       'Confirmed',
  in_progress:     'In progress',
  awaiting_report: 'Awaiting report',
  report_draft:    'Report draft',
  report_issued:   'Report issued',
  closed:          'Closed',
  cancelled:       'Cancelled',
};

// Migration 173: consultancy_visit_templates.category.
export const VISIT_TEMPLATE_CATEGORIES = [
  'general_hs', 'construction', 'manufacturing', 'iso', 'compliance', 'contractor_review',
] as const;
export type VisitTemplateCategory = typeof VISIT_TEMPLATE_CATEGORIES[number];
export const VISIT_TEMPLATE_CATEGORY_LABELS: Record<VisitTemplateCategory, string> = {
  general_hs:        'General H&S',
  construction:      'Construction',
  manufacturing:     'Manufacturing',
  iso:               'ISO',
  compliance:        'Compliance',
  contractor_review: 'Contractor review',
};

// Migration 169 (Group 3): the Client Service Ledger's own entry
// types — factual delivered value only, never a fabricated monetary or
// hours-saved figure.
export const SERVICE_LEDGER_ENTRY_TYPES = [
  'visit', 'audit', 'report', 'document', 'broadcast', 'service_request_resolved',
  'action_closed', 'training', 'incident_support', 'management_review_support', 'manual',
] as const;
export type ServiceLedgerEntryType = typeof SERVICE_LEDGER_ENTRY_TYPES[number];
export const SERVICE_LEDGER_ENTRY_TYPE_LABELS: Record<ServiceLedgerEntryType, string> = {
  visit:                      'Consultant visit',
  audit:                      'Audit',
  report:                     'Report',
  document:                   'Document',
  broadcast:                  'Broadcast',
  service_request_resolved:   'Service request resolved',
  action_closed:               'Action closed',
  training:                    'Training',
  incident_support:            'Incident support',
  management_review_support:   'Management review support',
  manual:                      'Manual entry',
};

// Migration 174 (Phase 7, Group 3): visit_observations.observation_type
// / .severity — structured findings captured during a mobile/tablet
// visit. immediate_danger escalates synchronously regardless of what
// severity is set to (visit_observation_escalate(), not this vocabulary).
export const OBSERVATION_TYPES = [
  'positive', 'observation', 'improvement', 'nonconformance', 'immediate_danger',
] as const;
export type ObservationType = typeof OBSERVATION_TYPES[number];
export const OBSERVATION_TYPE_LABELS: Record<ObservationType, string> = {
  positive:         'Positive finding',
  observation:      'Observation',
  improvement:      'Improvement opportunity',
  nonconformance:   'Nonconformance',
  immediate_danger: 'Immediate danger',
};

export const OBSERVATION_SEVERITIES = ['minor', 'moderate', 'major', 'critical'] as const;
export type ObservationSeverity = typeof OBSERVATION_SEVERITIES[number];
export const OBSERVATION_SEVERITY_LABELS: Record<ObservationSeverity, string> = {
  minor:    'Minor',
  moderate: 'Moderate',
  major:    'Major',
  critical: 'Critical',
};
