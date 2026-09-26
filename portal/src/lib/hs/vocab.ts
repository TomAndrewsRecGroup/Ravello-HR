// Health & Safety vocabularies. Each tuple mirrors a CHECK list in
// migrations 094/095; vocab.test.ts reads the SQL and fails if either
// side gains a value the other lacks (the statusMaps discipline: a
// string the database refuses is checked by nothing until a 23514).

// A named subject-area for a piece of evidence (hs_files.entity_type is
// validated against hs_scope_for_entity(), which this mirrors for
// display; it is no longer used to gate who may see what — 105 removed
// the provider grants that were the only thing scopes gated).
export const HS_SCOPES = ['register', 'documents', 'training', 'audits', 'incidents'] as const;
export type HsScope = typeof HS_SCOPES[number];
export const HS_SCOPE_LABELS: Record<HsScope, string> = {
  register:  'Register & visits',
  documents: 'Documents',
  training:  'Training',
  audits:    'Audits',
  incidents: 'Incidents',
};

export const HS_ACTIVITY_TYPES = [
  'site_visit', 'advice_call', 'fire_drill', 'ssip_submission', 'inspection', 'meeting', 'toolbox_talk', 'other',
] as const;
export type HsActivityType = typeof HS_ACTIVITY_TYPES[number];
export const HS_ACTIVITY_TYPE_LABELS: Record<HsActivityType, string> = {
  site_visit:      'Site visit',
  advice_call:     'Advice call',
  fire_drill:      'Fire drill',
  ssip_submission: 'SSIP submission',
  inspection:      'Inspection',
  meeting:         'Meeting',
  toolbox_talk:    'Toolbox talk',
  other:           'Other',
};

// Incidents (112) — RIDDOR record-keeping. The client can read these
// (it is THEIR legal duty; Core OS 360 maintains it on their behalf).
export const HS_INCIDENT_TYPES = [
  'injury', 'near_miss', 'dangerous_occurrence', 'disease', 'property_damage', 'other',
] as const;
export type HsIncidentType = typeof HS_INCIDENT_TYPES[number];
export const HS_INCIDENT_TYPE_LABELS: Record<HsIncidentType, string> = {
  injury:               'Injury',
  near_miss:            'Near miss',
  dangerous_occurrence: 'Dangerous occurrence',
  disease:              'Reportable disease',
  property_damage:      'Property damage',
  other:                'Other',
};

export const HS_INCIDENT_SEVERITIES = ['minor', 'significant', 'major', 'fatal'] as const;
export type HsIncidentSeverity = typeof HS_INCIDENT_SEVERITIES[number];
export const HS_INCIDENT_SEVERITY_LABELS: Record<HsIncidentSeverity, string> = {
  minor:       'Minor',
  significant: 'Significant',
  major:       'Major',
  fatal:       'Fatal',
};

export const HS_INCIDENT_STATUSES = ['open', 'investigating', 'closed'] as const;
export type HsIncidentStatus = typeof HS_INCIDENT_STATUSES[number];
export const HS_INCIDENT_STATUS_LABELS: Record<HsIncidentStatus, string> = {
  open:          'Open',
  investigating: 'Investigating',
  closed:        'Closed',
};

// Equipment register (112) — register-shaped like compliance_items (a
// mutable next_inspection_due a session updates directly), not
// completion-shaped like hs_register_completions: there is no separate
// "was it inspected" evidence trail here (MVP scope).
export const HS_EQUIPMENT_STATUSES = ['in_service', 'out_of_service', 'decommissioned'] as const;
export type HsEquipmentStatus = typeof HS_EQUIPMENT_STATUSES[number];
export const HS_EQUIPMENT_STATUS_LABELS: Record<HsEquipmentStatus, string> = {
  in_service:     'In service',
  out_of_service: 'Out of service',
  decommissioned: 'Decommissioned',
};

// Equipment inspection outcomes (114) — insert-only evidence trail, the
// same "a correction is a new row" shape as hs_register_completions.
// Unlike HS_COMPLETION_OUTCOMES there is no 'pass_with_actions' middle
// state: an inspection is a straightforward safe/unsafe call.
export const HS_EQUIPMENT_INSPECTION_OUTCOMES = ['pass', 'fail'] as const;
export type HsEquipmentInspectionOutcome = typeof HS_EQUIPMENT_INSPECTION_OUTCOMES[number];
export const HS_EQUIPMENT_INSPECTION_OUTCOME_LABELS: Record<HsEquipmentInspectionOutcome, string> = {
  pass: 'Pass',
  fail: 'Fail',
};

export const HS_RECURRENCE_UNITS = ['day', 'week', 'month', 'year'] as const;
export type HsRecurrenceUnit = typeof HS_RECURRENCE_UNITS[number];

// A single audit checklist answer (110). Unlike HS_COMPLETION_OUTCOMES
// (a register item's own periodic check), an audit answer has no
// "pass with actions raised" middle state — 'fail' IS the finding, and
// raising the action is what the fail causes, not a third rating.
export const HS_AUDIT_RATINGS = ['pass', 'fail', 'na'] as const;
export type HsAuditRating = typeof HS_AUDIT_RATINGS[number];
export const HS_AUDIT_RATING_LABELS: Record<HsAuditRating, string> = {
  pass: 'Pass',
  fail: 'Fail',
  na:   'N/A',
};

export const HS_COMPLETION_OUTCOMES = ['pass', 'pass_with_actions', 'fail'] as const;
export type HsCompletionOutcome = typeof HS_COMPLETION_OUTCOMES[number];
export const HS_COMPLETION_OUTCOME_LABELS: Record<HsCompletionOutcome, string> = {
  pass:              'Pass',
  pass_with_actions: 'Pass, actions raised',
  fail:              'Fail',
};

// Register categories. Anything starting hs_ is H&S (the generated
// compliance_items.domain column says so); the legacy 'health_safety'
// is also H&S. CHECK'd live since migration 109, on the union of this
// tuple and the generic HR form's COMPLIANCE_CATEGORIES.
export const HS_REGISTER_CATEGORIES = [
  'hs_policy_governance', 'hs_risk_assessment', 'hs_fire', 'hs_electrical', 'hs_gas',
  'hs_lifting', 'hs_work_equipment', 'hs_hazardous_substances', 'hs_water', 'hs_asbestos',
  'hs_first_aid', 'hs_construction', 'hs_health_surveillance', 'hs_care', 'hs_other',
] as const;
export type HsRegisterCategory = typeof HS_REGISTER_CATEGORIES[number];
export const HS_REGISTER_CATEGORY_LABELS: Record<HsRegisterCategory, string> = {
  hs_policy_governance:    'Policy & governance',
  hs_risk_assessment:      'Risk assessment',
  hs_fire:                 'Fire safety',
  hs_electrical:           'Electrical',
  hs_gas:                  'Gas',
  hs_lifting:              'Lifting (LOLER)',
  hs_work_equipment:       'Work equipment (PUWER)',
  hs_hazardous_substances: 'Hazardous substances (COSHH)',
  hs_water:                'Water hygiene (Legionella)',
  hs_asbestos:             'Asbestos',
  hs_first_aid:            'First aid',
  hs_construction:         'Construction (CDM)',
  hs_health_surveillance:  'Health surveillance',
  hs_care:                 'Care setting',
  hs_other:                'Other',
};

/** The domain the database derives for a category (mirror of compliance_items.domain). */
export function domainOf(category: string | null | undefined): 'hs' | 'hr' {
  const c = category ?? '';
  return c.startsWith('hs_') || c === 'health_safety' ? 'hs' : 'hr';
}

/** Label for an entity_type on the Safety Timeline. */
export const HS_ENTITY_LABELS: Record<string, string> = {
  register_item:       'Register',
  register_completion: 'Register',
  activity:            'Activity',
  site:                'Site',
  document:            'Document',
  training:            'Training',
  audit:               'Audit',
  audit_response:      'Audit finding',
  incident:            'Incident',
  equipment:           'Equipment',
  equipment_inspection: 'Equipment inspection',
};

// Tests (migration 116). Mirrors the CHECK on hs_tests.source_type /
// hs_test_submissions.source; hsTestsSql.test.ts pins it against 116's
// SQL, the same discipline as the other tuples above — kept in its own
// test file rather than vocab.test.ts's, since that one's FILES list
// scans a fixed set of earlier migrations for a "latest definition
// wins" resolution this simple, never-redefined CHECK doesn't need.
export const HS_TEST_SOURCE_TYPES = ['built_in', 'link', 'ms_forms', 'manual'] as const;
export type HsTestSourceType = typeof HS_TEST_SOURCE_TYPES[number];
export const HS_TEST_SOURCE_TYPE_LABELS: Record<HsTestSourceType, string> = {
  built_in: 'Built-in quiz (auto-marked)',
  link:     'External link',
  ms_forms: 'Microsoft Forms',
  manual:   'Manual / in-person',
};
