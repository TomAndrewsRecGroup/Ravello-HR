// Row shapes for the H&S tables (migrations 094/095). The Supabase
// clients here are untyped, so these are what the pages agree on.

import type {
  HsActivityType, HsAuditRating, HsCompletionOutcome, HsEquipmentInspectionOutcome, HsEquipmentStatus,
  HsIncidentSeverity, HsIncidentStatus, HsIncidentType, HsRecurrenceUnit,
  ContractorApprovalStatus, ContractorRiskRating, ContractorInsuranceType,
  PermitType, PermitStatus, IsolationType, IsolationStatus,
  EmergencyPlanType, EmergencyPlanStatus, EmergencyDrillOutcome,
  EnvironmentalAspectType, EnvironmentalAspectCondition, EnvironmentalAspectStatus,
  EnvironmentalSpillReceivingEnvironment, EnvironmentalSpillStatus,
  EnvironmentalMonitoringCategory, EnvironmentalPermitStatus, PermitConditionStatus,
  IsoStandardCode, StandardEvidenceEntityType,
  LegalApplicabilityStatus, ComplianceEvaluationStatus, LegalRequirementCategory, LegalResearchSource,
} from './vocab';

export interface HsRegisterItem {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  due_date: string | null;
  recurrence_every: number | null;
  recurrence_unit: HsRecurrenceUnit | null;
  last_completed_on: string | null;
  legal_basis: string | null;
  source: string;
  site_id: string | null;
}

export interface HsCompletion {
  id: string;
  item_id: string;
  completed_on: string;
  outcome: HsCompletionOutcome;
  notes: string | null;
  next_due_on: string | null;
  recorded_by_kind: string;
  created_at: string;
}

export interface HsActivity {
  id: string;
  company_id: string;
  activity_type: HsActivityType;
  title: string;
  occurred_on: string;
  summary: string | null;
  recorded_by_kind: string;
  created_at: string;
}

export interface HsEvent {
  id: number;
  occurred_at: string;
  entity_type: string;
  entity_id: string | null;
  event_type: string;
  summary: string;
  actor_kind: string;
}

export interface HsFile {
  id: string;
  entity_type: string;
  entity_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
}

export interface HsDocument {
  id: string;
  company_id: string;
  site_id: string | null;
  category: string;
  title: string;
  description: string | null;
  version: number;
  review_due_at: string | null;
  status: 'active' | 'superseded';
  supersedes_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HsSectorPackItem {
  id: string;
  pack_id: string;
  category: string;
  title: string;
  description: string | null;
  recurrence_every: number | null;
  recurrence_unit: HsRecurrenceUnit | null;
  legal_basis: string | null;
  sort_order: number;
}

export interface HsSectorPack {
  id: string;
  sector: string;
  name: string;
  description: string | null;
}

export interface HsAuditTemplate {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface HsAuditTemplateItem {
  id: string;
  template_id: string;
  category: string | null;
  prompt: string;
  guidance: string | null;
  sort_order: number;
}

export interface HsAudit {
  id: string;
  company_id: string;
  site_id: string | null;
  template_id: string | null;
  title: string;
  conducted_on: string;
  score: number | null;
  notes: string | null;
  recorded_by_kind: string;
  created_at: string;
}

export interface HsAuditResponse {
  id: string;
  audit_id: string;
  company_id: string;
  template_item_id: string | null;
  prompt: string;
  category: string | null;
  rating: HsAuditRating;
  comment: string | null;
  sort_order: number;
  created_at: string;
}

export interface HsIncident {
  id: string;
  company_id: string;
  incident_number: string;
  title: string | null;
  site_id: string | null;
  department_id: string | null;
  exact_location: string | null;
  incident_type: HsIncidentType;
  occurred_on: string;
  incident_time: string | null;
  /** Can hold medical detail: never put it in a notification, timeline or log. */
  description: string;
  activity_underway: string | null;
  immediate_actions: string[];
  severity: HsIncidentSeverity | null;
  severity_confirmed_by: string | null;
  severity_confirmed_at: string | null;
  investigation_required: boolean;
  riddor_review_status: string;
  riddor_reportable: boolean;
  riddor_reported_on: string | null;
  status: HsIncidentStatus;
  reported_by: string | null;
  reported_at: string;
  closed_at: string | null;
  close_override_reason: string | null;
  linked_risk_assessment_id: string | null;
  no_assessment_existed: boolean;
  linked_asset_id: string | null;
  row_version: number;
  created_at: string;
  updated_at: string;
}

export interface HsEquipment {
  id: string;
  company_id: string;
  site_id: string | null;
  name: string;
  category: string | null;
  serial_number: string | null;
  status: HsEquipmentStatus;
  last_inspected_on: string | null;
  next_inspection_due: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HsActivityAttendee {
  id: string;
  activity_id: string;
  company_id: string;
  employee_id: string;
  created_at: string;
}

export interface HsEquipmentInspection {
  id: string;
  equipment_id: string;
  company_id: string;
  inspected_on: string;
  outcome: HsEquipmentInspectionOutcome;
  next_due_on: string | null;
  notes: string | null;
  recorded_by_kind: string;
  created_at: string;
}

// Phase 4, Group 13: admin UI row shapes for contractors (150),
// permits (152), isolations (153) and emergency planning (154).

export interface Contractor {
  id: string;
  company_id: string;
  name: string;
  registration_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  approval_status: ContractorApprovalStatus;
  risk_rating: ContractorRiskRating | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorInsurance {
  id: string;
  contractor_id: string;
  company_id: string;
  insurance_type: ContractorInsuranceType;
  provider: string | null;
  policy_number: string | null;
  cover_amount: number | null;
  expires_on: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PermitTemplate {
  id: string;
  company_id: string;
  name: string;
  permit_type: PermitType;
  description: string | null;
  required_authorisation_type_id: string | null;
  default_validity_hours: number | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Permit {
  id: string;
  company_id: string;
  permit_number: string | null;
  template_id: string;
  site_id: string;
  asset_id: string | null;
  scope_of_work: string;
  status: PermitStatus;
  issued_by: string | null;
  issued_at: string | null;
  authorised_person_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  suspended_reason: string | null;
  revalidated_at: string | null;
  revalidated_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  closeout_notes: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PermitPerson {
  id: string;
  permit_id: string;
  company_id: string;
  person_id: string;
  added_at: string;
}

export interface Isolation {
  id: string;
  company_id: string;
  asset_id: string;
  permit_id: string | null;
  isolation_type: IsolationType;
  description: string | null;
  status: IsolationStatus;
  applied_by: string;
  applied_at: string;
  verified_by: string | null;
  verified_at: string | null;
  removed_by: string | null;
  removed_at: string | null;
  removal_verified_by: string | null;
  removal_verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IsolationLock {
  id: string;
  isolation_id: string;
  company_id: string;
  person_id: string;
  lock_number: string | null;
  applied_at: string;
  removed_at: string | null;
  removed_by: string | null;
  override_reason: string | null;
  override_authorised_by: string | null;
}

export interface EmergencyPlan {
  id: string;
  company_id: string;
  site_id: string | null;
  plan_type: EmergencyPlanType;
  title: string;
  description: string | null;
  version: number;
  review_due_at: string | null;
  status: EmergencyPlanStatus;
  supersedes_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmergencyPlanRole {
  id: string;
  plan_id: string;
  authorisation_type_id: string;
  min_count: number;
  notes: string | null;
}

export interface EmergencyPlanEquipment {
  id: string;
  plan_id: string;
  asset_id: string;
  notes: string | null;
}

export interface EmergencyDrill {
  id: string;
  company_id: string;
  plan_id: string;
  site_id: string | null;
  drill_date: string;
  conducted_by: string | null;
  evacuation_time_seconds: number | null;
  outcome: EmergencyDrillOutcome;
  findings: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EnvironmentalAspect {
  id: string;
  company_id: string;
  site_id: string | null;
  activity: string;
  aspect_type: EnvironmentalAspectType;
  condition: EnvironmentalAspectCondition;
  description: string | null;
  version: number;
  status: EnvironmentalAspectStatus;
  supersedes_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentalAspectAssessment {
  id: string;
  aspect_id: string;
  company_id: string;
  likelihood: number;
  severity: number;
  frequency: number;
  computed_score: number;
  significance_threshold_used: number;
  is_significant: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  methodology_notes: string | null;
  created_by: string | null;
  created_at: string;
}

// Core-OS 360 Phase 5, Group 2 (migration 157).

export interface EnvironmentalIncidentDetail {
  id: string;
  hs_incident_id: string;
  company_id: string;
  substance: string | null;
  estimated_volume: number | null;
  volume_unit: string | null;
  receiving_environment: EnvironmentalSpillReceivingEnvironment | null;
  environmental_agency_notified: boolean;
  notified_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EnvironmentalSpill {
  id: string;
  company_id: string;
  site_id: string | null;
  occurred_at: string;
  substance: string;
  estimated_volume: number | null;
  volume_unit: string | null;
  receiving_environment: EnvironmentalSpillReceivingEnvironment;
  contained: boolean;
  notified_authority: boolean;
  notified_at: string | null;
  hs_incident_id: string | null;
  status: EnvironmentalSpillStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WasteStream {
  id: string;
  company_id: string;
  name: string;
  waste_code: string | null;
  hazardous: boolean;
  typical_disposal_route: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WasteMovement {
  id: string;
  company_id: string;
  waste_stream_id: string;
  site_id: string | null;
  moved_at: string;
  quantity: number;
  unit: string;
  carrier_contractor_id: string;
  disposal_site_contractor_id: string | null;
  consignment_note_reference: string | null;
  non_conformance: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentalMonitoringReading {
  id: string;
  company_id: string;
  site_id: string | null;
  category: EnvironmentalMonitoringCategory;
  parameter: string;
  value: number;
  unit: string;
  recorded_limit: number | null;
  within_limit: boolean | null;
  recorded_at: string;
  recorded_by: string | null;
  created_at: string;
}

export interface EnvironmentalPermit {
  id: string;
  company_id: string;
  site_id: string | null;
  permit_type: string;
  permit_number: string | null;
  issuing_authority: string | null;
  issued_on: string | null;
  expires_on: string | null;
  status: EnvironmentalPermitStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PermitCondition {
  id: string;
  environmental_permit_id: string;
  company_id: string;
  condition_text: string;
  review_frequency: string | null;
  next_review_due: string | null;
  status: PermitConditionStatus;
  last_evidence_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Core-OS 360 Phase 5, Group 3 (migration 158): the shared ISO 45001/
// 14001 management-system framework.

export interface ManagementSystemStandard {
  id: string;
  code: IsoStandardCode;
  name: string;
  created_at: string;
}

export interface StandardClause {
  id: string;
  standard_id: string;
  clause_number: string;
  title: string;
  maps_to_hint: StandardEvidenceEntityType | string | null;
  display_order: number;
  created_at: string;
}

export interface StandardEvidenceLink {
  id: string;
  company_id: string;
  clause_id: string;
  entity_type: string;
  entity_id: string;
  added_by: string | null;
  created_at: string;
}

export interface IsoCertification {
  id: string;
  company_id: string;
  standard_id: string;
  certificate_number: string | null;
  certifying_body: string | null;
  issued_on: string | null;
  expires_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Core-OS 360 Phase 5, Group 4 (migration 159): the Legal Register.

export interface LegalRequirement {
  id: string;
  title: string;
  category: LegalRequirementCategory;
  jurisdiction: string;
  summary: string | null;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationLegalObligation {
  id: string;
  company_id: string;
  legal_requirement_id: string;
  applicability_status: LegalApplicabilityStatus;
  assessed_by: string | null;
  assessed_at: string | null;
  assessment_rationale: string | null;
  next_review_due: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceEvaluation {
  id: string;
  obligation_id: string;
  company_id: string;
  status: ComplianceEvaluationStatus;
  evaluated_by: string | null;
  evaluated_at: string;
  notes: string | null;
  next_review_due: string | null;
  created_at: string;
}

// Inert Tavily-research foundation — no live API call anywhere in this
// codebase yet; a later group wires one.
export interface LegalRequirementResearchNote {
  id: string;
  legal_requirement_id: string;
  source: LegalResearchSource;
  query_used: string | null;
  raw_result_summary: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  action_taken: string | null;
  created_by: string | null;
  created_at: string;
}
