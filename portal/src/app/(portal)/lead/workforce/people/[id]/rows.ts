// Row shapes the person profile reads (132-137). Types only: safe to
// import from client components.

export interface PersonRow {
  id: string; full_name: string; preferred_name: string | null; email: string | null; worker_type: string;
  engagement_type: string | null; lifecycle_status: string | null; contractor_company: string | null;
  employee_number: string | null; start_date: string | null; end_date: string | null; site_id: string | null;
  department_id: string | null; manager_id: string | null; primary_role_id: string | null; user_id: string | null;
}

export interface AssignmentRow {
  id: string; role_id: string; site_id: string | null; department_id: string | null; primary_assignment: boolean;
  start_date: string; end_date: string | null; assignment_status: string; ended_reason: string | null;
}

export interface TrainingRow {
  id: string; course_id: string | null; course_name: string; provider: string | null; completed_on: string;
  expires_on: string | null; result: string; certificate_number: string | null; evidence_path: string | null;
  verification_status: string; verified_at: string | null; rejection_reason: string | null; source: string;
  submitted_by: string | null;
}

export interface CompetencyRow {
  id: string; competency_id: string; level_id: string; assessed_on: string; expires_on: string | null;
  assessment_method: string; assessor_name: string | null; assessed_by: string | null; evidence_path: string | null;
  verification_status: string; verified_at: string | null; rejection_reason: string | null; created_at: string;
}

export interface SuspensionRow {
  id: string; competency_id: string; suspended_at: string; reason: string; lifted_at: string | null; lift_reason: string | null;
}

export interface CredentialRow {
  id: string; credential_type_id: string; credential_number: string | null; awarding_body: string | null;
  issued_on: string | null; expires_on: string | null; evidence_path: string | null; verification_status: string;
  verified_at: string | null; rejection_reason: string | null; source: string; submitted_by: string | null;
}

export interface InductionAssignmentRow {
  id: string; induction_template_id: string; assigned_on: string; required_before: string | null; status: string;
}
export interface InductionCompletionRow {
  id: string; induction_template_id: string; completed_on: string; delivered_by_name: string | null;
  reinduction_due: string | null; evidence_path: string | null;
}

export interface AuthorisationRow {
  id: string; authorisation_type_id: string; scope_site_id: string | null; scope_detail: string | null;
  issuing_authority: string | null; issued_on: string; expires_on: string | null; evidence_path: string | null;
  status: string; revoked_at: string | null; revoke_reason: string | null;
}
export interface AuthSuspensionRow {
  id: string; authorisation_id: string; suspended_at: string; reason: string; lifted_at: string | null; lift_reason: string | null;
}

export interface PpeRow {
  id: string; ppe_type_id: string; issued_on: string; replacement_due: string | null; serial_number: string | null;
  size: string | null; returned_on: string | null;
}

export interface CheckRow {
  id: string; check_type_id: string; status: string; requested_on: string | null; received_on: string | null;
  evidence_path: string | null; verified_at: string | null; decision_reason: string | null;
}

export interface ExceptionRow {
  id: string; requirement_type: string; reference_id: string | null; reference_key: string | null; kind: string;
  reason: string; valid_from: string; valid_until: string; revoked_at: string | null;
}

export interface DevelopmentRow {
  id: string; title: string; source_type: string; status: string; due_date: string | null;
  linked_course_id: string | null; linked_competency_id: string | null; created_at: string;
}

export interface PersonRequirementRow {
  id: string; requirement_type: string; reference_id: string | null; reference_key: string | null; mandatory: boolean;
  safety_critical: boolean; effective_from: string | null; effective_until: string | null; source_type: string | null;
  required_by: string | null;
}

export interface HealthOutcomeRow {
  id: string; requirement_id: string | null; assessed_on: string; provider?: string | null; outcome: string;
  restriction_summary?: string | null; review_date: string | null;
}

export interface DuplicateRow { person_id: string; full_name: string; worker_type: string; lifecycle_status: string | null; matches: string[] }

/** Catalogue options passed to the action forms. */
export interface Option { id: string; title: string }
export interface CourseOption extends Option { validity_months: number | null; safety_critical: boolean }
export interface CompetencyOption extends Option { safety_critical: boolean; assessment_method: string; renewal_months: number | null }
export interface LevelOption { id: string; label: string; rank: number }
export interface CredentialTypeOption extends Option { kind: string; awarding_body: string | null; validity_months: number | null }
export interface AuthTypeOption extends Option { validity_months: number | null; safety_critical: boolean }
export interface RoleOption extends Option { safety_critical: boolean }
export interface SiteOption { id: string; name: string }
export interface DepartmentOption { id: string; name: string; site_id: string | null }
