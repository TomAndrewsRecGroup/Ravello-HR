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

// PUWER assessment outcomes (148) — a RECORDED outcome, never a legal
// compliance certification (Phase 4's own standing rule: never assert
// legal compliance). Every label here says what was found, not what the
// law requires.
export const PUWER_ASSESSMENT_OUTCOMES = ['compliant', 'non_compliant', 'compliant_with_actions'] as const;
export type PuwerAssessmentOutcome = typeof PUWER_ASSESSMENT_OUTCOMES[number];
export const PUWER_ASSESSMENT_OUTCOME_LABELS: Record<PuwerAssessmentOutcome, string> = {
  compliant:               'Compliant',
  non_compliant:           'Non-compliant',
  compliant_with_actions:  'Compliant, with actions',
};

// Contractors (150). approval_status is the prequalification OUTCOME —
// there is no separate score. risk_rating is optional (a contractor may
// have no rating yet). insurance_type covers the two UK-standard
// required policies plus a catch-all 'other'.
export const CONTRACTOR_APPROVAL_STATUSES = ['pending', 'approved', 'suspended', 'rejected'] as const;
export type ContractorApprovalStatus = typeof CONTRACTOR_APPROVAL_STATUSES[number];
export const CONTRACTOR_APPROVAL_STATUS_LABELS: Record<ContractorApprovalStatus, string> = {
  pending:   'Pending',
  approved:  'Approved',
  suspended: 'Suspended',
  rejected:  'Rejected',
};

export const CONTRACTOR_RISK_RATINGS = ['low', 'medium', 'high'] as const;
export type ContractorRiskRating = typeof CONTRACTOR_RISK_RATINGS[number];
export const CONTRACTOR_RISK_RATING_LABELS: Record<ContractorRiskRating, string> = {
  low:    'Low',
  medium: 'Medium',
  high:   'High',
};

export const CONTRACTOR_INSURANCE_TYPES = ['employers_liability', 'public_liability', 'professional_indemnity', 'other'] as const;
export type ContractorInsuranceType = typeof CONTRACTOR_INSURANCE_TYPES[number];
export const CONTRACTOR_INSURANCE_TYPE_LABELS: Record<ContractorInsuranceType, string> = {
  employers_liability:     "Employers' liability",
  public_liability:        'Public liability',
  professional_indemnity:  'Professional indemnity',
  other:                   'Other',
};

// Permit to work (152). permit_type names the hazard category a
// template covers; status is the lifecycle
// draft -> issued -> suspended -> closed/revoked, enforced by the
// permits_lifecycle_guard() trigger, never by the UI alone.
export const PERMIT_TYPES = ['hot_work', 'confined_space', 'working_at_height', 'electrical_isolation', 'excavation', 'other'] as const;
export type PermitType = typeof PERMIT_TYPES[number];
export const PERMIT_TYPE_LABELS: Record<PermitType, string> = {
  hot_work:              'Hot work',
  confined_space:        'Confined space',
  working_at_height:     'Working at height',
  electrical_isolation:  'Electrical isolation',
  excavation:            'Excavation',
  other:                 'Other',
};

export const PERMIT_STATUSES = ['draft', 'issued', 'suspended', 'closed', 'revoked'] as const;
export type PermitStatus = typeof PERMIT_STATUSES[number];
export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  draft:     'Draft',
  issued:    'Issued',
  suspended: 'Suspended',
  closed:    'Closed',
  revoked:   'Revoked',
};

// Isolation / LOTO (153). isolation_type is the energy source being
// de-energised; status is the lifecycle applied -> verified -> removed,
// enforced by isolations_lifecycle_guard() — verification and removal
// each need a DIFFERENT person from whoever did the previous step.
export const ISOLATION_TYPES = ['electrical', 'mechanical', 'hydraulic', 'pneumatic', 'thermal', 'chemical', 'other'] as const;
export type IsolationType = typeof ISOLATION_TYPES[number];
export const ISOLATION_TYPE_LABELS: Record<IsolationType, string> = {
  electrical: 'Electrical',
  mechanical: 'Mechanical',
  hydraulic:  'Hydraulic',
  pneumatic:  'Pneumatic',
  thermal:    'Thermal',
  chemical:   'Chemical',
  other:      'Other',
};

export const ISOLATION_STATUSES = ['applied', 'verified', 'removed'] as const;
export type IsolationStatus = typeof ISOLATION_STATUSES[number];
export const ISOLATION_STATUS_LABELS: Record<IsolationStatus, string> = {
  applied:  'Applied',
  verified: 'Verified',
  removed:  'Removed',
};

// Emergency planning (154). emergency_plans reuses hs_documents' own
// versioning discipline (a new version is a new row); emergency_drills
// is insert-only, the register's own "a correction is a new row" rule.
export const EMERGENCY_PLAN_TYPES = ['fire', 'evacuation', 'medical', 'chemical_spill', 'severe_weather', 'security', 'other'] as const;
export type EmergencyPlanType = typeof EMERGENCY_PLAN_TYPES[number];
export const EMERGENCY_PLAN_TYPE_LABELS: Record<EmergencyPlanType, string> = {
  fire:            'Fire',
  evacuation:      'Evacuation',
  medical:         'Medical',
  chemical_spill:  'Chemical spill',
  severe_weather:  'Severe weather',
  security:        'Security',
  other:           'Other',
};

export const EMERGENCY_PLAN_STATUSES = ['active', 'superseded'] as const;
export type EmergencyPlanStatus = typeof EMERGENCY_PLAN_STATUSES[number];
export const EMERGENCY_PLAN_STATUS_LABELS: Record<EmergencyPlanStatus, string> = {
  active:     'Active',
  superseded: 'Superseded',
};

export const EMERGENCY_DRILL_OUTCOMES = ['successful', 'issues_found', 'failed'] as const;
export type EmergencyDrillOutcome = typeof EMERGENCY_DRILL_OUTCOMES[number];
export const EMERGENCY_DRILL_OUTCOME_LABELS: Record<EmergencyDrillOutcome, string> = {
  successful:   'Successful',
  issues_found: 'Issues found',
  failed:       'Failed',
};

// LOLER thorough examination type (149) — a single value today, framed
// as a vocabulary because a generic "thorough examination" framework is
// meant to grow (LOLER first, per the Phase 4 plan). NULL on a row means
// a plain routine inspection, not a LOLER thorough examination.
export const HS_EXAMINATION_TYPES = ['loler_thorough_examination'] as const;
export type HsExaminationType = typeof HS_EXAMINATION_TYPES[number];
export const HS_EXAMINATION_TYPE_LABELS: Record<HsExaminationType, string> = {
  loler_thorough_examination: 'LOLER thorough examination',
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

// Core-OS 360 Phase 5, Group 1 (migration 156): environmental aspects &
// impacts. Mirrors the CHECK on environmental_aspects.aspect_type/
// .condition/.status; vocab.test.ts pins these against 156's SQL.
export const ENVIRONMENTAL_ASPECT_TYPES = [
  'emissions_to_air', 'discharge_to_water', 'waste_generation', 'land_contamination',
  'resource_use', 'noise', 'energy_use', 'raw_material_use', 'other',
] as const;
export type EnvironmentalAspectType = typeof ENVIRONMENTAL_ASPECT_TYPES[number];
export const ENVIRONMENTAL_ASPECT_TYPE_LABELS: Record<EnvironmentalAspectType, string> = {
  emissions_to_air:    'Emissions to air',
  discharge_to_water:  'Discharge to water',
  waste_generation:    'Waste generation',
  land_contamination:  'Land contamination',
  resource_use:        'Resource use',
  noise:               'Noise',
  energy_use:          'Energy use',
  raw_material_use:    'Raw material use',
  other:               'Other',
};

export const ENVIRONMENTAL_ASPECT_CONDITIONS = ['normal', 'abnormal', 'emergency'] as const;
export type EnvironmentalAspectCondition = typeof ENVIRONMENTAL_ASPECT_CONDITIONS[number];
export const ENVIRONMENTAL_ASPECT_CONDITION_LABELS: Record<EnvironmentalAspectCondition, string> = {
  normal:    'Normal operation',
  abnormal:  'Abnormal operation',
  emergency: 'Emergency condition',
};

// Never 'compliant'/'non_compliant' — significance is a risk-based
// judgement (likelihood x severity x frequency, confirmed by a named
// person), not a legal-compliance verdict. See CLAUDE.md's standing
// rule against certification language.
export const ENVIRONMENTAL_ASPECT_STATUSES = [
  'draft', 'assessed', 'confirmed_significant', 'confirmed_not_significant', 'superseded',
] as const;
export type EnvironmentalAspectStatus = typeof ENVIRONMENTAL_ASPECT_STATUSES[number];
export const ENVIRONMENTAL_ASPECT_STATUS_LABELS: Record<EnvironmentalAspectStatus, string> = {
  draft:                     'Draft',
  assessed:                  'Assessed',
  confirmed_significant:     'Confirmed significant',
  confirmed_not_significant: 'Confirmed not significant',
  superseded:                'Superseded',
};

// Core-OS 360 Phase 5, Group 2 (migration 157): environmental
// incidents/spills/waste/monitoring/permits. Mirrors the CHECKs on
// environmental_spills.receiving_environment/.status,
// environmental_monitoring.category, environmental_permits.status and
// permit_conditions.status; vocab.test.ts pins these against 157's SQL.

export const ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENTS = ['land', 'water', 'drain', 'air', 'other'] as const;
export type EnvironmentalSpillReceivingEnvironment = typeof ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENTS[number];
export const ENVIRONMENTAL_SPILL_RECEIVING_ENVIRONMENT_LABELS: Record<EnvironmentalSpillReceivingEnvironment, string> = {
  land:  'Land',
  water: 'Water',
  drain: 'Drain',
  air:   'Air',
  other: 'Other',
};

export const ENVIRONMENTAL_SPILL_STATUSES = ['reported', 'contained', 'closed'] as const;
export type EnvironmentalSpillStatus = typeof ENVIRONMENTAL_SPILL_STATUSES[number];
export const ENVIRONMENTAL_SPILL_STATUS_LABELS: Record<EnvironmentalSpillStatus, string> = {
  reported:  'Reported',
  contained: 'Contained',
  closed:    'Closed',
};

export const ENVIRONMENTAL_MONITORING_CATEGORIES = ['water', 'air', 'noise', 'energy', 'emissions', 'other'] as const;
export type EnvironmentalMonitoringCategory = typeof ENVIRONMENTAL_MONITORING_CATEGORIES[number];
export const ENVIRONMENTAL_MONITORING_CATEGORY_LABELS: Record<EnvironmentalMonitoringCategory, string> = {
  water:     'Water',
  air:       'Air',
  noise:     'Noise',
  energy:    'Energy',
  emissions: 'Emissions',
  other:     'Other',
};

// Which way a recorded_limit is compared against the value (186).
// 'upper' is the default and the only direction every reading recorded
// before this migration ever used — a lower-bound or range reading
// must be set explicitly.
export const ENVIRONMENTAL_MONITORING_LIMIT_DIRECTIONS = ['upper', 'lower', 'range'] as const;
export type EnvironmentalMonitoringLimitDirection = typeof ENVIRONMENTAL_MONITORING_LIMIT_DIRECTIONS[number];
export const ENVIRONMENTAL_MONITORING_LIMIT_DIRECTION_LABELS: Record<EnvironmentalMonitoringLimitDirection, string> = {
  upper: 'Maximum (upper bound)',
  lower: 'Minimum (lower bound)',
  range: 'Range (both bounds)',
};

// A lifecycle fact about the permit itself, never a compliance verdict.
export const ENVIRONMENTAL_PERMIT_STATUSES = ['active', 'expired', 'surrendered', 'revoked'] as const;
export type EnvironmentalPermitStatus = typeof ENVIRONMENTAL_PERMIT_STATUSES[number];
export const ENVIRONMENTAL_PERMIT_STATUS_LABELS: Record<EnvironmentalPermitStatus, string> = {
  active:      'Active',
  expired:     'Expired',
  surrendered: 'Surrendered',
  revoked:     'Revoked',
};

// Never 'compliant'/'non_compliant'/'legal' — a permit condition's
// status is a factual record, never a compliance judgement. See
// CLAUDE.md's standing rule against certification language.
export const PERMIT_CONDITION_STATUSES = ['current', 'evidence_due', 'overdue', 'breach_recorded', 'review_required'] as const;
export type PermitConditionStatus = typeof PERMIT_CONDITION_STATUSES[number];
export const PERMIT_CONDITION_STATUS_LABELS: Record<PermitConditionStatus, string> = {
  current:         'Current',
  evidence_due:    'Evidence due',
  overdue:         'Overdue',
  breach_recorded: 'Breach recorded',
  review_required: 'Review required',
};

// Core-OS 360 Phase 5, Group 3 (migration 158): the shared ISO 45001/
// 14001 management-system framework. management_system_standards.code
// is seeded, not CHECK-constrained (deliberately extensible to a third
// standard later) — this tuple pins the two rows migration 158 seeds;
// vocab.test.ts parses the INSERT and pins it against 158's SQL.
export const ISO_STANDARD_CODES = ['iso_45001_2018', 'iso_14001_2015'] as const;
export type IsoStandardCode = typeof ISO_STANDARD_CODES[number];
export const ISO_STANDARD_CODE_LABELS: Record<IsoStandardCode, string> = {
  iso_45001_2018: 'ISO 45001:2018',
  iso_14001_2015: 'ISO 14001:2015',
};

// A short menu of what kind of EXISTING record a piece of evidence can
// be — the hs_entity_table() keys this platform already has evidence
// for. Not exhaustive of every hs_entity_table() key (a certification
// or an action makes an odd "evidence for a clause" choice) — this is
// the practical subset the "add evidence" form offers, and the ones
// this migration's own seeded clauses use as a maps_to_hint.
export const STANDARD_EVIDENCE_ENTITY_TYPES = [
  'document', 'risk_assessment', 'hazard', 'compliance_item', 'training_record',
  'audit', 'inspection', 'incident', 'contractor', 'equipment', 'action',
  'environmental_aspect', 'environmental_permit', 'environmental_monitoring', 'waste_movement',
] as const;
export type StandardEvidenceEntityType = typeof STANDARD_EVIDENCE_ENTITY_TYPES[number];
export const STANDARD_EVIDENCE_ENTITY_TYPE_LABELS: Record<StandardEvidenceEntityType, string> = {
  document:                    'Document',
  risk_assessment:              'Risk assessment',
  hazard:                       'Hazard',
  compliance_item:              'Register item',
  training_record:              'Training record',
  audit:                        'Audit',
  inspection:                   'Inspection',
  incident:                     'Incident',
  contractor:                   'Contractor',
  equipment:                    'Asset / equipment',
  action:                       'Action',
  environmental_aspect:         'Environmental aspect',
  environmental_permit:         'Environmental permit',
  environmental_monitoring:     'Environmental monitoring reading',
  waste_movement:               'Waste movement',
};

// Core-OS 360 Phase 5, Group 4 (migration 159): the Legal Register.
// EXACT cautious vocabulary — never "compliant"/"non_compliant"/
// "legal"/"illegal" anywhere in these labels. See CLAUDE.md's standing
// rule against certification/compliance-verdict language.

// A HUMAN applicability decision (never AI, never automatic — the
// database's own gate on organisation_legal_obligations_stamp() refuses
// 'applicable'/'not_applicable' without a named assessor + timestamp).
export const LEGAL_APPLICABILITY_STATUSES = ['not_assessed', 'applicable', 'not_applicable', 'under_review'] as const;
export type LegalApplicabilityStatus = typeof LEGAL_APPLICABILITY_STATUSES[number];
export const LEGAL_APPLICABILITY_STATUS_LABELS: Record<LegalApplicabilityStatus, string> = {
  not_assessed:   'Not yet assessed',
  applicable:     'Applicable',
  not_applicable: 'Not applicable',
  under_review:   'Under review',
};

// The ONE vocabulary compliance_evaluations.status may ever hold —
// factual evaluation states, never a verdict on the platform's own
// authority. 'potential_noncompliance'/'confirmed_noncompliance' are
// the two that raise a client action (lib/events/legalRegisterRules.ts).
export const COMPLIANCE_EVALUATION_STATUSES = [
  'evidence_current', 'evidence_incomplete', 'review_due',
  'potential_noncompliance', 'confirmed_noncompliance', 'not_evaluated',
] as const;
export type ComplianceEvaluationStatus = typeof COMPLIANCE_EVALUATION_STATUSES[number];
export const COMPLIANCE_EVALUATION_STATUS_LABELS: Record<ComplianceEvaluationStatus, string> = {
  evidence_current:        'Evidence current',
  evidence_incomplete:     'Evidence incomplete',
  review_due:              'Review due',
  potential_noncompliance: 'Potential non-compliance recorded',
  confirmed_noncompliance: 'Confirmed non-compliance recorded',
  not_evaluated:           'Not yet evaluated',
};

// legal_requirements.category — a parallel, small legal-domain set,
// genuinely different from COMPLIANCE_CATEGORIES (a client's own item
// categories) and HS_REGISTER_CATEGORIES (recurring H&S check types): a
// piece of LEGISLATION is neither. See migration 159's own header.
export const LEGAL_REQUIREMENT_CATEGORIES = [
  'health_safety', 'environmental', 'employment_law', 'data_protection',
  'fire_safety', 'food_safety', 'licensing', 'consumer', 'general', 'other',
] as const;
export type LegalRequirementCategory = typeof LEGAL_REQUIREMENT_CATEGORIES[number];
export const LEGAL_REQUIREMENT_CATEGORY_LABELS: Record<LegalRequirementCategory, string> = {
  health_safety:   'Health & Safety',
  environmental:   'Environmental',
  employment_law:  'Employment Law',
  data_protection: 'Data Protection',
  fire_safety:     'Fire Safety',
  food_safety:     'Food Safety',
  licensing:       'Licensing',
  consumer:        'Consumer',
  general:         'General',
  other:           'Other',
};

// The Tavily-research-notes foundation (inert today — no live API call
// anywhere in this codebase; a later group wires one).
export const LEGAL_RESEARCH_SOURCES = ['tavily', 'manual'] as const;
export type LegalResearchSource = typeof LEGAL_RESEARCH_SOURCES[number];
export const LEGAL_RESEARCH_SOURCE_LABELS: Record<LegalResearchSource, string> = {
  tavily: 'Tavily (automated research)',
  manual: 'Manual',
};

// Core-OS 360 Phase 5, Group 5 (migration 160): Controlled Document
// Management. hs_documents' status CHECK extended from 106's plain
// active/superseded to a formal author/reviewer/approver lifecycle,
// enforced by hs_document_lifecycle_guard() (the database, not the
// UI). vocab.test.ts pins this against 160's SQL.
export const HS_DOCUMENT_STATUSES = [
  'draft', 'pending_review', 'pending_approval', 'approved', 'active',
  'review_due', 'superseded', 'withdrawn', 'archived',
] as const;
export type HsDocumentStatus = typeof HS_DOCUMENT_STATUSES[number];
export const HS_DOCUMENT_STATUS_LABELS: Record<HsDocumentStatus, string> = {
  draft:             'Draft',
  pending_review:    'Pending review',
  pending_approval:  'Pending approval',
  approved:          'Approved',
  active:            'Active (current)',
  review_due:        'Review due',
  superseded:        'Superseded',
  withdrawn:         'Withdrawn',
  archived:          'Archived',
};

/** Statuses whose content (title/category/description) is immutable —
 *  the exact set hs_document_lifecycle_guard() locks; an edit request
 *  on one of these must be a NEW VERSION, never an UPDATE. */
export const HS_DOCUMENT_IMMUTABLE_STATUSES: readonly HsDocumentStatus[] = [
  'approved', 'active', 'review_due', 'superseded', 'withdrawn', 'archived',
];

/** Statuses that no longer represent the current, in-force version —
 *  shown in a document's History view, never in a "current" list. */
export const HS_DOCUMENT_HISTORY_STATUSES: readonly HsDocumentStatus[] = [
  'superseded', 'withdrawn', 'archived',
];

// Core-OS 360 Phase 5, Group 6 (migration 161): Objectives & Targets,
// and Management Review. Factual progress states, never a compliance
// verdict — objective_measurements_roll() (the database, not this UI)
// computes the transition deterministically from the latest measurement
// against target_value/target_direction.
export const OBJECTIVE_STATUSES = [
  'draft', 'active', 'on_track', 'at_risk', 'achieved', 'missed', 'abandoned',
] as const;
export type ObjectiveStatus = typeof OBJECTIVE_STATUSES[number];
export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  draft:     'Draft',
  active:    'Active',
  on_track:  'On track',
  at_risk:   'At risk',
  achieved:  'Achieved',
  missed:    'Missed',
  abandoned: 'Abandoned',
};

export const OBJECTIVE_TARGET_DIRECTIONS = ['increase', 'decrease'] as const;
export type ObjectiveTargetDirection = typeof OBJECTIVE_TARGET_DIRECTIONS[number];
export const OBJECTIVE_TARGET_DIRECTION_LABELS: Record<ObjectiveTargetDirection, string> = {
  increase: 'Higher is better (increase toward target)',
  decrease: 'Lower is better (decrease toward target)',
};

export const MANAGEMENT_REVIEW_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type ManagementReviewStatus = typeof MANAGEMENT_REVIEW_STATUSES[number];
export const MANAGEMENT_REVIEW_STATUS_LABELS: Record<ManagementReviewStatus, string> = {
  scheduled:   'Scheduled',
  in_progress: 'In progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

// Core-OS 360 Phase 5, Group 7 (migration 162): Internal Audit
// Enhancement, Governance Calendar, Worker Consultation, Environmental
// Complaints. audit_findings.severity — a genuinely new, small
// vocabulary the task itself specifies (not a reuse of actions.severity,
// which is low/medium/high/critical for a DIFFERENT column on a
// different table). audit_findings_closure_guard() (the database, not
// this UI) is what actually enforces the major/critical closure gate.
export const AUDIT_FINDING_SEVERITIES = ['minor', 'major', 'critical'] as const;
export type AuditFindingSeverity = typeof AUDIT_FINDING_SEVERITIES[number];
export const AUDIT_FINDING_SEVERITY_LABELS: Record<AuditFindingSeverity, string> = {
  minor:    'Minor',
  major:    'Major',
  critical: 'Critical',
};

export const AUDIT_PROGRAMME_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'biannual', 'annual', 'other'] as const;
export type AuditProgrammeFrequency = typeof AUDIT_PROGRAMME_FREQUENCIES[number];
export const AUDIT_PROGRAMME_FREQUENCY_LABELS: Record<AuditProgrammeFrequency, string> = {
  weekly:    'Weekly',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  biannual:  'Twice a year',
  annual:    'Annual',
  other:     'Other',
};

export const CONSULTATION_METHODS = ['meeting', 'survey', 'committee', 'one_to_one', 'other'] as const;
export type ConsultationMethod = typeof CONSULTATION_METHODS[number];
export const CONSULTATION_METHOD_LABELS: Record<ConsultationMethod, string> = {
  meeting:    'Meeting',
  survey:     'Survey',
  committee:  'Safety committee',
  one_to_one: 'One-to-one',
  other:      'Other',
};

export const COMPLAINT_SOURCES = ['neighbour', 'regulator', 'employee', 'public', 'other'] as const;
export type ComplaintSource = typeof COMPLAINT_SOURCES[number];
export const COMPLAINT_SOURCE_LABELS: Record<ComplaintSource, string> = {
  neighbour: 'Neighbour',
  regulator: 'Regulator',
  employee:  'Employee',
  public:    'Member of the public',
  other:     'Other',
};
