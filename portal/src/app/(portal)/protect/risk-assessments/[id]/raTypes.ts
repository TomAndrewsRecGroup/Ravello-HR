// Row shapes for the risk assessment screens — the exact columns of
// 123's risk_assessments / risk_assessment_items / risk_item_controls /
// controls that the pages select.
import type { ControlEffectiveness, ControlStage, ControlType, DocStatus, PersonsAtRisk, RiskItemStatus } from '@/lib/hs/safetyVocab';
import type { RiskMatrix } from '@/lib/hs/riskMatrix';

export interface RaRow {
  id: string;
  company_id: string;
  reference: string;
  version: number;
  previous_version_id: string | null;
  copied_from_id: string | null;
  template_id: string | null;
  template_version: number | null;
  title: string;
  assessment_type_id: string | null;
  activity_or_process: string | null;
  description: string | null;
  site_id: string | null;
  department_id: string | null;
  assessor_id: string | null;
  responsible_manager_id: string | null;
  risk_matrix_id: string;
  status: DocStatus;
  assessment_date: string;
  review_date: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  review_comments: string | null;
  approved_by: string | null;
  approved_at: string | null;
  activated_at: string | null;
  superseded_at: string | null;
  superseded_by_id: string | null;
  review_reason: string | null;
  review_requested_at: string | null;
  review_requested_by: string | null;
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
  archived_at: string | null;
  row_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const RA_COLUMNS = 'id, company_id, reference, version, previous_version_id, copied_from_id, template_id, template_version, title, assessment_type_id, activity_or_process, description, site_id, department_id, assessor_id, responsible_manager_id, risk_matrix_id, status, assessment_date, review_date, submitted_at, submitted_by, review_comments, approved_by, approved_at, activated_at, superseded_at, superseded_by_id, review_reason, review_requested_at, review_requested_by, last_reviewed_at, last_reviewed_by, archived_at, row_version, created_by, created_at, updated_at';

export interface RaItem {
  id: string;
  risk_assessment_id: string;
  hazard_id: string | null;
  hazard_description: string;
  persons_at_risk: PersonsAtRisk[];
  persons_at_risk_notes: string | null;
  existing_controls: string | null;
  likelihood_before: number;
  severity_before: number;
  initial_risk_score: number;
  further_controls_required: string | null;
  likelihood_after: number | null;
  severity_after: number | null;
  residual_risk_score: number | null;
  owner_id: string | null;
  due_date: string | null;
  status: RiskItemStatus;
  sort_order: number;
}

export interface RaItemControl {
  id: string;
  risk_assessment_item_id: string;
  control_id: string;
  stage: ControlStage;
  control_title: string;
  control_type: ControlType;
  effectiveness: ControlEffectiveness;
  effectiveness_recorded_by: string | null;
  effectiveness_recorded_at: string | null;
  notes: string | null;
}

export interface LibraryControl { id: string; title: string; control_type: ControlType; status: string; verification_required: boolean; safety_critical: boolean }

export interface MatrixRow extends RiskMatrix { id: string; name: string; company_id: string | null; is_default: boolean }

export interface Person { user_id: string; full_name: string }
