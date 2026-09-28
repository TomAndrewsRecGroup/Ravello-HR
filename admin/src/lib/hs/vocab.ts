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

// Incidents — 125 replaced 112's vocabulary (0 live rows at the time).
// The client can read their incidents; RIDDOR record-keeping is THEIR
// legal duty. The rest of the incident vocabulary is in safetyVocab.ts.
export const HS_INCIDENT_TYPES = [
  'accident', 'injury', 'near_miss', 'dangerous_occurrence', 'property_damage', 'environmental',
  'occupational_ill_health', 'security', 'other',
] as const;
export type HsIncidentType = typeof HS_INCIDENT_TYPES[number];
export const HS_INCIDENT_TYPE_LABELS: Record<HsIncidentType, string> = {
  accident:                'Accident',
  injury:                  'Injury',
  near_miss:               'Near miss',
  dangerous_occurrence:    'Dangerous occurrence',
  property_damage:         'Property damage',
  environmental:           'Environmental',
  occupational_ill_health: 'Occupational ill health',
  security:                'Security',
  other:                   'Other',
};

/** Confirmed by a person (who, when) — nullable until then. */
export const HS_INCIDENT_SEVERITIES = ['minor', 'moderate', 'serious', 'major', 'critical', 'fatal'] as const;
export type HsIncidentSeverity = typeof HS_INCIDENT_SEVERITIES[number];
export const HS_INCIDENT_SEVERITY_LABELS: Record<HsIncidentSeverity, string> = {
  minor:    'Minor',
  moderate: 'Moderate',
  serious:  'Serious',
  major:    'Major',
  critical: 'Critical',
  fatal:    'Fatal',
};
/** Severities whose corrective actions must be verified (actions_lifecycle). */
export const HS_VERIFY_SEVERITIES = ['major', 'critical', 'fatal'] as const;

export const HS_INCIDENT_STATUSES = [
  'reported', 'triage', 'under_investigation', 'awaiting_actions', 'awaiting_verification', 'closed', 'archived',
] as const;
export type HsIncidentStatus = typeof HS_INCIDENT_STATUSES[number];
export const HS_INCIDENT_STATUS_LABELS: Record<HsIncidentStatus, string> = {
  reported:              'Reported',
  triage:                'Triage',
  under_investigation:   'Under investigation',
  awaiting_actions:      'Awaiting actions',
  awaiting_verification: 'Awaiting verification',
  closed:                'Closed',
  archived:              'Archived',
};
/** Mirror of hs_incident_transition_ok (125) — the database is the gate. */
const HS_INCIDENT_TRANSITIONS: ReadonlyArray<readonly [HsIncidentStatus, HsIncidentStatus]> = [
  ['reported', 'triage'],
  ['triage', 'under_investigation'], ['triage', 'awaiting_actions'], ['triage', 'closed'],
  ['under_investigation', 'awaiting_actions'], ['under_investigation', 'closed'], ['under_investigation', 'triage'],
  ['awaiting_actions', 'awaiting_verification'], ['awaiting_actions', 'closed'], ['awaiting_actions', 'under_investigation'],
  ['awaiting_verification', 'closed'], ['awaiting_verification', 'awaiting_actions'],
  ['closed', 'archived'], ['closed', 'triage'],
];
export function incidentNextStatuses(from: HsIncidentStatus): HsIncidentStatus[] {
  return HS_INCIDENT_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t);
}

// Equipment register (112) — register-shaped like compliance_items (a
// mutable next_inspection_due a session updates directly), not
// completion-shaped like hs_register_completions: there is no separate
// "was it inspected" evidence trail here (MVP scope).
// 'quarantined' added by 144 (Phase 4, Group 2: the asset register) —
// ahead of Group 4 (defects), the status a safety-critical asset moves to
// on a failed inspection/defect, before any hierarchy/permit/isolation
// logic reads it.
export const HS_EQUIPMENT_STATUSES = ['in_service', 'out_of_service', 'decommissioned', 'quarantined'] as const;
export type HsEquipmentStatus = typeof HS_EQUIPMENT_STATUSES[number];
export const HS_EQUIPMENT_STATUS_LABELS: Record<HsEquipmentStatus, string> = {
  in_service:     'In service',
  out_of_service: 'Out of service',
  decommissioned: 'Decommissioned',
  quarantined:    'Quarantined',
};

// Asset type (144) — what kind of thing an asset is, for filtering and
// reporting. A CHECKed vocabulary, not free text.
export const HS_ASSET_TYPES = [
  'plant', 'machinery', 'vehicle', 'tool', 'lifting_equipment', 'fixed_installation', 'ppe_equipment', 'other',
] as const;
export type HsAssetType = typeof HS_ASSET_TYPES[number];
export const HS_ASSET_TYPE_LABELS: Record<HsAssetType, string> = {
  plant:               'Plant',
  machinery:           'Machinery',
  vehicle:             'Vehicle',
  tool:                'Tool',
  lifting_equipment:   'Lifting equipment',
  fixed_installation:  'Fixed installation',
  ppe_equipment:       'PPE equipment',
  other:               'Other',
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
