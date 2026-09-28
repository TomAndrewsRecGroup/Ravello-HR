import type { HsIncidentSeverity, HsIncidentStatus, HsIncidentType } from '@/lib/hs/vocab';
import type { InvestigationStatus, RiddorDecision, RiddorReviewStatus, TrainingFinding } from '@/lib/hs/safetyVocab';

export interface IncidentRow {
  id: string; company_id: string; incident_number: string; incident_type: HsIncidentType; title: string | null; description: string;
  occurred_on: string; incident_time: string | null; reported_at: string; reported_by: string | null; person_in_charge_id: string | null;
  site_id: string | null; department_id: string | null; exact_location: string | null; activity_underway: string | null;
  immediate_action: string | null; immediate_actions: string[]; severity: HsIncidentSeverity | null; severity_confirmed_by: string | null;
  severity_confirmed_at: string | null; status: HsIncidentStatus; investigation_required: boolean; riddor_review_status: RiddorReviewStatus;
  riddor_reportable: boolean; riddor_reported_on: string | null; linked_risk_assessment_id: string | null; no_assessment_existed: boolean;
  linked_asset_id: string | null; linked_contractor_id: string | null; triaged_by: string | null; triaged_at: string | null;
  closed_by: string | null; closed_at: string | null; close_override_reason: string | null; archived_at: string | null; row_version: number;
}

export interface IncidentPersonRow {
  id: string; person_id: string | null; external_name: string | null; role_in_incident: string; employer: string | null; created_at: string;
}

export interface SensitiveRow {
  incident_person_id: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null;
  body_parts: string[]; injury_types: string[]; treatment: string | null; first_aid_given: boolean | null;
  hospital_attendance: string | null; time_lost: boolean | null; days_lost: number | null; work_restriction: string | null;
  return_date: string | null; notes: string | null; recorded_by: string | null; updated_at: string;
}

export interface InvestigationRow {
  id: string; reference: string; lead_investigator_id: string | null; team_member_ids: string[]; started_at: string;
  target_completion_date: string | null; completed_at: string | null; summary: string | null; sequence_of_events: string | null;
  immediate_causes: string | null; underlying_causes: string | null; root_causes: string | null; contributing_factors: string | null;
  findings: string | null; lessons_learned: string | null; status: InvestigationStatus; submitted_at: string | null;
  submitted_by: string | null; review_comments: string | null; approved_by: string | null; approved_at: string | null; row_version: number;
}

export interface TimelineRow { id: string; sequence: number; event_time: string | null; title: string; description: string | null; person_id: string | null }
export interface CauseRow { id: string; cause_level: string; category: string; description: string; confirmed_by: string | null; confirmed_at: string | null }
export interface WhyRow { id: string; problem: string; whys: string[]; conclusion: string | null; linked_cause_id: string | null }

export interface RiddorRow {
  id: string; death: boolean | null; specified_injury: boolean | null; over_seven_day_incapacity: boolean | null;
  dangerous_occurrence: boolean | null; occupational_disease: boolean | null; gas_incident: boolean | null;
  non_worker_hospital: boolean | null; notes: string | null; status: RiddorReviewStatus; decision: RiddorDecision | null;
  decision_by: string | null; decision_at: string | null; rationale: string | null; reporting_reference: string | null;
  report_date: string | null; row_version: number;
}

export interface ActionRow {
  id: string; title: string; status: string; priority: string; action_class: string | null; due_date: string | null;
  assigned_to: string | null; verifier_id: string | null; verification_required: boolean; verified_at: string | null;
  source_type: string | null; completed_at: string | null;
}

export interface Option { id: string; label: string }
export interface Person { user_id: string; full_name: string }

/** incident_training_evidence() — investigators only (130). */
export interface TrainingEvidenceRow {
  incident_person_id: string; person_id: string; training_record_id: string; course_name: string; provider: string | null;
  completed_on: string; expires_on: string | null; status_at_incident: TrainingFinding; incident_date: string;
}

/** incident_training_checks — the investigator's recorded finding, a snapshot (130). */
export interface TrainingCheckRow {
  id: string; incident_person_id: string; course_name: string; completed_on: string | null; expires_on: string | null;
  status_at_incident: TrainingFinding; incident_date: string; note: string | null; checked_by: string | null; checked_at: string;
  withdrawn_at: string | null; withdrawn_by: string | null; withdrawn_reason: string | null;
}
