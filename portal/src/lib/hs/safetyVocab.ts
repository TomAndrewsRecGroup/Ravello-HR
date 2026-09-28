// Core-OS 360 Phase 2 — the operational H&S core's vocabularies, one
// tuple per CHECK in migrations 123 (hazards, risk assessments), 124
// (RAMS, COSHH), 125 (incidents, investigations, RIDDOR, corrective
// actions) and 130 (incident → training findings). safetyVocab.test.ts
// pins every tuple against the LATEST SQL definition in both
// directions, so a value added on one side alone fails the suite
// instead of 22P02-ing a save.
//
// Byte-identical in admin and portal (scripts/check-shared-dupes.sh).
// Hazard categories and assessment types are LOOKUP TABLES (org-
// configurable rows), not CHECKs — read them from the database.

const labels = <T extends string>(m: Record<T, string>) => m;

/* ─── Hazards (123) ───────────────────────────────────────────── */

export const HAZARD_STATUSES = ['identified', 'under_assessment', 'controlled', 'monitoring', 'closed', 'archived'] as const;
export type HazardStatus = typeof HAZARD_STATUSES[number];
export const HAZARD_STATUS_LABELS = labels<HazardStatus>({
  identified: 'Identified', under_assessment: 'Under assessment', controlled: 'Controlled',
  monitoring: 'Monitoring', closed: 'Closed', archived: 'Archived',
});

export const HAZARD_SOURCES = ['quick_report', 'inspection', 'audit', 'risk_assessment', 'incident', 'near_miss', 'consultation', 'other'] as const;
export type HazardSource = typeof HAZARD_SOURCES[number];
export const HAZARD_SOURCE_LABELS = labels<HazardSource>({
  quick_report: 'Quick report', inspection: 'Inspection', audit: 'Audit', risk_assessment: 'Risk assessment',
  incident: 'Incident', near_miss: 'Near miss', consultation: 'Consultation', other: 'Other',
});

/** Also the four display levels of a risk-matrix band. */
export const RISK_LEVELS = ['low', 'medium', 'high', 'very_high'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];
export const RISK_LEVEL_LABELS = labels<RiskLevel>({ low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very high' });

/* ─── Controls (123) ──────────────────────────────────────────── */

/** The hierarchy of control, most effective first. Order matters. */
export const CONTROL_TYPES = ['elimination', 'substitution', 'engineering', 'administrative', 'ppe'] as const;
export type ControlType = typeof CONTROL_TYPES[number];
export const CONTROL_TYPE_LABELS = labels<ControlType>({
  elimination: 'Elimination', substitution: 'Substitution', engineering: 'Engineering controls',
  administrative: 'Administrative controls', ppe: 'PPE',
});

export const CONTROL_CATEGORIES = ['lev', 'enclosure', 'substitution', 'ventilation', 'ppe_rpe', 'restricted_access',
  'hygiene', 'exposure_monitoring', 'health_surveillance', 'other'] as const;
export type ControlCategory = typeof CONTROL_CATEGORIES[number];
export const CONTROL_CATEGORY_LABELS = labels<ControlCategory>({
  lev: 'Local exhaust ventilation', enclosure: 'Enclosure', substitution: 'Substitution', ventilation: 'Ventilation',
  ppe_rpe: 'PPE / RPE', restricted_access: 'Restricted access', hygiene: 'Hygiene',
  exposure_monitoring: 'Exposure monitoring', health_surveillance: 'Health surveillance', other: 'Other',
});

export const CONTROL_EFFECTIVENESS = ['in_place', 'partially_implemented', 'ineffective', 'not_implemented', 'verification_required'] as const;
export type ControlEffectiveness = typeof CONTROL_EFFECTIVENESS[number];
export const CONTROL_EFFECTIVENESS_LABELS = labels<ControlEffectiveness>({
  in_place: 'In place', partially_implemented: 'Partially implemented', ineffective: 'Ineffective',
  not_implemented: 'Not implemented', verification_required: 'Verification required',
});

export const CONTROL_STAGES = ['existing', 'additional'] as const;
export type ControlStage = typeof CONTROL_STAGES[number];

/* ─── Controlled documents: RA, RAMS, COSHH (123/124) ─────────── */

export const DOC_STATUSES = ['draft', 'pending_review', 'changes_requested', 'approved', 'active', 'review_due', 'superseded', 'archived'] as const;
export type DocStatus = typeof DOC_STATUSES[number];
/** RAMS have no periodic review state. */
export const RAMS_STATUSES = ['draft', 'pending_review', 'changes_requested', 'approved', 'active', 'superseded', 'archived'] as const;
export const DOC_STATUS_LABELS = labels<DocStatus>({
  draft: 'Draft', pending_review: 'Pending review', changes_requested: 'Changes requested', approved: 'Approved',
  active: 'Active', review_due: 'Review due', superseded: 'Superseded', archived: 'Archived',
});
/** Content is editable only in these states (hs_doc_guard). */
export const DOC_EDITABLE_STATUSES = ['draft', 'changes_requested'] as const;
/** "Live" versions: at most one per reference once approved. */
export const DOC_LIVE_STATUSES = ['approved', 'active', 'review_due'] as const;

export type DocKind = 'risk_assessment' | 'method_statement' | 'coshh_assessment';

/** Mirror of hs_doc_transition_ok (123). The database is the gate; this
 *  only decides which buttons a screen offers. */
const DOC_TRANSITIONS: ReadonlyArray<readonly [DocStatus, DocStatus]> = [
  ['draft', 'pending_review'], ['draft', 'archived'],
  ['pending_review', 'changes_requested'], ['pending_review', 'approved'], ['pending_review', 'draft'],
  ['changes_requested', 'pending_review'], ['changes_requested', 'draft'], ['changes_requested', 'archived'],
  ['approved', 'active'], ['approved', 'review_due'], ['approved', 'superseded'], ['approved', 'archived'],
  ['active', 'review_due'], ['active', 'superseded'], ['active', 'archived'],
  ['review_due', 'active'], ['review_due', 'superseded'], ['review_due', 'archived'],
  ['superseded', 'archived'],
];
export function docTransitionOk(kind: DocKind, from: DocStatus, to: DocStatus): boolean {
  if (kind === 'method_statement' && (from === 'review_due' || to === 'review_due')) return false;
  return DOC_TRANSITIONS.some(([f, t]) => f === from && t === to);
}
export function docNextStatuses(kind: DocKind, from: DocStatus): DocStatus[] {
  return DOC_STATUSES.filter(to => docTransitionOk(kind, from, to));
}

export const RA_REVIEW_REASONS = ['scheduled', 'incident', 'near_miss', 'equipment_change', 'process_change',
  'legislation_change', 'new_substance', 'new_employee_group', 'audit_finding', 'other'] as const;
export const COSHH_REVIEW_REASONS = ['scheduled', 'sds_change', 'process_change', 'incident', 'near_miss',
  'exposure_control_change', 'legislation_change', 'audit_finding', 'other'] as const;
export const REVIEW_REASON_LABELS: Record<string, string> = {
  scheduled: 'Scheduled review', incident: 'Incident', near_miss: 'Near miss', equipment_change: 'Equipment change',
  process_change: 'Process change', legislation_change: 'Legislation change', new_substance: 'New substance',
  new_employee_group: 'New employee group', audit_finding: 'Audit finding', sds_change: 'Safety data sheet change',
  exposure_control_change: 'Exposure control change', other: 'Other',
};

export const RISK_ITEM_STATUSES = ['open', 'in_progress', 'complete', 'not_required'] as const;
export type RiskItemStatus = typeof RISK_ITEM_STATUSES[number];
export const RISK_ITEM_STATUS_LABELS = labels<RiskItemStatus>({
  open: 'Open', in_progress: 'In progress', complete: 'Complete', not_required: 'Not required',
});

export const PERSONS_AT_RISK = ['employees', 'contractors', 'visitors', 'members_of_public', 'young_workers',
  'pregnant_workers', 'lone_workers', 'named_individuals'] as const;
export type PersonsAtRisk = typeof PERSONS_AT_RISK[number];
export const PERSONS_AT_RISK_LABELS = labels<PersonsAtRisk>({
  employees: 'Employees', contractors: 'Contractors', visitors: 'Visitors', members_of_public: 'Members of the public',
  young_workers: 'Young workers', pregnant_workers: 'New / expectant mothers', lone_workers: 'Lone workers',
  named_individuals: 'Named individuals',
});

/* ─── RAMS (124) ──────────────────────────────────────────────── */

/** The only keys method_statements.sections may hold (hs_rams_sections_valid). */
export const RAMS_SECTION_KEYS = ['purpose', 'scope', 'location', 'work_sequence', 'responsibilities', 'plant_equipment',
  'materials', 'ppe', 'access_egress', 'site_setup', 'exclusion_zones', 'lifting_arrangements', 'isolations',
  'environmental_controls', 'emergency_arrangements', 'waste_disposal', 'supervision', 'communication',
  'competency_requirements', 'permits_required'] as const;
export type RamsSectionKey = typeof RAMS_SECTION_KEYS[number];
export const RAMS_SECTION_LABELS = labels<RamsSectionKey>({
  purpose: 'Purpose', scope: 'Scope', location: 'Location', work_sequence: 'Sequence of work',
  responsibilities: 'Responsibilities', plant_equipment: 'Plant and equipment', materials: 'Materials', ppe: 'PPE',
  access_egress: 'Access and egress', site_setup: 'Site set-up', exclusion_zones: 'Exclusion zones',
  lifting_arrangements: 'Lifting arrangements', isolations: 'Isolations', environmental_controls: 'Environmental controls',
  emergency_arrangements: 'Emergency arrangements', waste_disposal: 'Waste disposal', supervision: 'Supervision',
  communication: 'Communication', competency_requirements: 'Competency requirements', permits_required: 'Permits required',
});

export const RAMS_ACK_METHODS = ['in_person', 'digital', 'toolbox_talk', 'other'] as const;
export const RAMS_ACK_METHOD_LABELS: Record<typeof RAMS_ACK_METHODS[number], string> = {
  in_person: 'In person', digital: 'Digitally', toolbox_talk: 'At a toolbox talk', other: 'Other',
};

/* ─── Substances and COSHH (124) ──────────────────────────────── */

export const SUBSTANCE_TYPES = ['liquid', 'solid', 'powder', 'gas', 'aerosol', 'paste', 'dust', 'fume', 'vapour', 'biological', 'other'] as const;
export const SUBSTANCE_STATUSES = ['active', 'discontinued', 'archived'] as const;

/** GHS pictograms. A person confirms them from the SDS — never inferred. */
export const GHS_PICTOGRAMS = ['GHS01', 'GHS02', 'GHS03', 'GHS04', 'GHS05', 'GHS06', 'GHS07', 'GHS08', 'GHS09'] as const;
export type GhsPictogram = typeof GHS_PICTOGRAMS[number];
export const GHS_PICTOGRAM_LABELS = labels<GhsPictogram>({
  GHS01: 'Explosive', GHS02: 'Flammable', GHS03: 'Oxidising', GHS04: 'Gas under pressure', GHS05: 'Corrosive',
  GHS06: 'Acute toxicity', GHS07: 'Harmful / irritant', GHS08: 'Serious health hazard', GHS09: 'Hazardous to the environment',
});

export const EXPOSURE_ROUTES = ['inhalation', 'skin', 'ingestion', 'eye', 'injection', 'combination'] as const;
export const EXPOSURE_ROUTE_LABELS: Record<typeof EXPOSURE_ROUTES[number], string> = {
  inhalation: 'Inhalation', skin: 'Skin contact', ingestion: 'Ingestion', eye: 'Eye contact',
  injection: 'Injection', combination: 'Combination',
};

/* ─── Incidents (125) ─────────────────────────────────────────── */

export const INCIDENT_IMMEDIATE_ACTIONS = ['stop_work', 'isolate_equipment', 'cordon_area', 'first_aid', 'notify_manager',
  'emergency_services', 'remove_substance', 'secure_evidence'] as const;
export type IncidentImmediateAction = typeof INCIDENT_IMMEDIATE_ACTIONS[number];
export const INCIDENT_IMMEDIATE_ACTION_LABELS = labels<IncidentImmediateAction>({
  stop_work: 'Work stopped', isolate_equipment: 'Equipment isolated', cordon_area: 'Area cordoned off',
  first_aid: 'First aid given', notify_manager: 'Manager notified', emergency_services: 'Emergency services called',
  remove_substance: 'Substance removed', secure_evidence: 'Evidence secured',
});

export const RIDDOR_REVIEW_STATUSES = ['not_reviewed', 'review_required', 'potentially_reportable',
  'confirmed_reportable', 'confirmed_not_reportable', 'reported'] as const;
export type RiddorReviewStatus = typeof RIDDOR_REVIEW_STATUSES[number];
export const RIDDOR_REVIEW_STATUS_LABELS = labels<RiddorReviewStatus>({
  not_reviewed: 'Not reviewed', review_required: 'Review required', potentially_reportable: 'Potentially reportable',
  confirmed_reportable: 'Reportable — report not yet recorded', confirmed_not_reportable: 'Not reportable',
  reported: 'Reported',
});
/** riddor_reviews.status has no not_reviewed: a row exists once a review starts. */
export const RIDDOR_REVIEW_ROW_STATUSES = RIDDOR_REVIEW_STATUSES.filter(s => s !== 'not_reviewed');
export const RIDDOR_DECISIONS = ['reportable', 'not_reportable', 'further_review'] as const;
export type RiddorDecision = typeof RIDDOR_DECISIONS[number];
export const RIDDOR_DECISION_LABELS = labels<RiddorDecision>({
  reportable: 'Reportable', not_reportable: 'Not reportable', further_review: 'Needs further review',
});
/** Decision-support prompts. Answering yes flags the review; it never decides. */
export const RIDDOR_FLAGS = ['death', 'specified_injury', 'over_seven_day_incapacity', 'dangerous_occurrence',
  'occupational_disease', 'gas_incident', 'non_worker_hospital'] as const;
export type RiddorFlag = typeof RIDDOR_FLAGS[number];
export const RIDDOR_FLAG_LABELS = labels<RiddorFlag>({
  death: 'Did anyone die as a result?',
  specified_injury: 'Was there a specified injury (e.g. fracture other than fingers/toes, amputation, loss of sight)?',
  over_seven_day_incapacity: 'Was a worker unable to do their normal work for more than seven consecutive days?',
  dangerous_occurrence: 'Was this a listed dangerous occurrence?',
  occupational_disease: 'Has a reportable occupational disease been diagnosed?',
  gas_incident: 'Was this a reportable gas incident?',
  non_worker_hospital: 'Was a non-worker taken directly to hospital for treatment?',
});

export const INCIDENT_PERSON_ROLES = ['injured_person', 'affected_person', 'witness', 'supervisor', 'first_aider',
  'contractor_employee', 'member_of_public'] as const;
export type IncidentPersonRole = typeof INCIDENT_PERSON_ROLES[number];
export const INCIDENT_PERSON_ROLE_LABELS = labels<IncidentPersonRole>({
  injured_person: 'Injured person', affected_person: 'Affected person', witness: 'Witness', supervisor: 'Supervisor',
  first_aider: 'First aider', contractor_employee: 'Contractor employee', member_of_public: 'Member of the public',
});

export const BODY_PARTS = ['head', 'face', 'eye', 'neck', 'back', 'chest', 'abdomen', 'shoulder', 'arm', 'elbow',
  'wrist', 'hand', 'finger', 'hip', 'leg', 'knee', 'ankle', 'foot', 'toe', 'multiple', 'internal', 'other'] as const;
export const INJURY_TYPES = ['cut_laceration', 'bruise_contusion', 'fracture', 'sprain_strain', 'burn', 'crush',
  'amputation', 'puncture', 'dislocation', 'concussion', 'eye_injury', 'electric_shock', 'poisoning', 'asphyxiation',
  'hearing_damage', 'occupational_disease', 'psychological', 'other'] as const;
export const TREATMENTS = ['none', 'first_aid_only', 'medical_treatment', 'hospital'] as const;
export const TREATMENT_LABELS: Record<typeof TREATMENTS[number], string> = {
  none: 'None', first_aid_only: 'First aid only', medical_treatment: 'Medical treatment', hospital: 'Hospital',
};
export const HOSPITAL_ATTENDANCE = ['none', 'treated_and_released', 'admitted', 'admitted_over_24h'] as const;
export const HOSPITAL_ATTENDANCE_LABELS: Record<typeof HOSPITAL_ATTENDANCE[number], string> = {
  none: 'None', treated_and_released: 'Treated and released', admitted: 'Admitted', admitted_over_24h: 'Admitted for more than 24 hours',
};

/** Pretty label for any snake_case vocabulary value without its own map. */
export function humanise(v: string | null | undefined): string {
  if (!v) return '';
  const s = v.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ─── Investigations (125) ────────────────────────────────────── */

export const INVESTIGATION_STATUSES = ['in_progress', 'pending_approval', 'changes_requested', 'approved'] as const;
export type InvestigationStatus = typeof INVESTIGATION_STATUSES[number];
export const INVESTIGATION_STATUS_LABELS = labels<InvestigationStatus>({
  in_progress: 'In progress', pending_approval: 'Pending approval', changes_requested: 'Changes requested', approved: 'Approved',
});

export const CAUSE_LEVELS = ['immediate', 'underlying', 'root'] as const;
export type CauseLevel = typeof CAUSE_LEVELS[number];
export const CAUSE_LEVEL_LABELS = labels<CauseLevel>({ immediate: 'Immediate cause', underlying: 'Underlying cause', root: 'Root cause' });

export const CAUSE_CATEGORIES = ['people', 'plant_equipment', 'process', 'procedure', 'environment', 'management',
  'training', 'supervision', 'maintenance', 'communication', 'design', 'contractor', 'organisational'] as const;
export type CauseCategory = typeof CAUSE_CATEGORIES[number];
export const CAUSE_CATEGORY_LABELS = labels<CauseCategory>({
  people: 'People', plant_equipment: 'Plant / equipment', process: 'Process', procedure: 'Procedure',
  environment: 'Environment', management: 'Management', training: 'Training', supervision: 'Supervision',
  maintenance: 'Maintenance', communication: 'Communication', design: 'Design', contractor: 'Contractor',
  organisational: 'Organisational',
});

/** 5 Whys: one to ten — never forced to five. */
export const WHYS_MIN = 1;
export const WHYS_MAX = 10;

/* ─── Corrective actions (125) ────────────────────────────────── */

export const ACTION_CLASSES = ['immediate_correction', 'corrective', 'preventive', 'improvement'] as const;
export type ActionClass = typeof ACTION_CLASSES[number];
export const ACTION_CLASS_LABELS = labels<ActionClass>({
  immediate_correction: 'Immediate correction', corrective: 'Corrective', preventive: 'Preventive', improvement: 'Improvement',
});

export const EFFECTIVENESS_OUTCOMES = ['effective', 'partially_effective', 'not_effective'] as const;
export type EffectivenessOutcome = typeof EFFECTIVENESS_OUTCOMES[number];
export const EFFECTIVENESS_OUTCOME_LABELS = labels<EffectivenessOutcome>({
  effective: 'Effective', partially_effective: 'Partially effective', not_effective: 'Not effective',
});

/* ─── Incident → training (130) ───────────────────────────────── */
// What a training record said ON THE INCIDENT DATE — a fact for the
// investigator, never a cause. hs_training_status_at() decides it.

export const TRAINING_FINDINGS = ['current', 'no_expiry', 'expired', 'completed_after', 'not_recorded'] as const;
export type TrainingFinding = typeof TRAINING_FINDINGS[number];
export const TRAINING_FINDING_LABELS = labels<TrainingFinding>({
  current: 'In date', no_expiry: 'Completed, no expiry', expired: 'Expired',
  completed_after: 'Completed after the incident', not_recorded: 'No completion on record',
});

/* ─── Where each record lives in the portal ───────────────────── */
// One map, so notification links (admin rules) and the portal pages
// cannot disagree about a URL.

export const PROTECT_PATHS = {
  hazards:          '/protect/hazards',
  risk_assessment:  '/protect/risk-assessments',
  method_statement: '/protect/rams',
  coshh_assessment: '/protect/coshh',
  substances:       '/protect/substances',
  incidents:        '/protect/incidents',
  actions:          '/protect/actions',
  analysis:         '/protect/analysis',
} as const;

export function docPath(kind: DocKind, id?: string | null): string {
  return id ? `${PROTECT_PATHS[kind]}/${id}` : PROTECT_PATHS[kind];
}
export const hazardPath = (id?: string | null) => (id ? `${PROTECT_PATHS.hazards}/${id}` : PROTECT_PATHS.hazards);
export const incidentPath = (id?: string | null) => (id ? `${PROTECT_PATHS.incidents}/${id}` : PROTECT_PATHS.incidents);
