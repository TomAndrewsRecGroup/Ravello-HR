import type { DeploymentStatus, RequirementStatus, RequirementType } from './vocab';

// The Safe to Deploy result, exactly as the database returns it
// (136 _wf_deployment / person_deployment_status / 138 workforce_matrix).
// The shape is the engine's; nothing here recalculates anything.

export interface DeploymentReason {
  code: 'unmet' | 'review' | 'excepted' | 'met_with_restrictions' | 'not_active' | 'no_role' | 'calculation_error';
  type?: RequirementType | 'onboarding';
  name?: string;
  safety_critical?: boolean;
  text: string;
}

export interface DeploymentRequirement {
  type: RequirementType;
  reference_id: string | null;
  reference_key: string | null;
  name: string | null;
  mandatory: boolean;
  safety_critical: boolean;
  status: RequirementStatus;
  detail: string | null;
  evidence_date: string | null;
  expires_on: string | null;
  required_by: string | null;
  sources: { scope: 'role' | 'site' | 'person' | 'pre_employment'; scope_id: string; rule_id?: string }[];
}

export interface DeploymentResult {
  person_id: string;
  company_id?: string;
  as_of: string;
  status: DeploymentStatus;
  computed_at: string;
  valid_until: string | null;
  reasons: DeploymentReason[];
  summary: { required: number; met: number; unmet: number; review: number; conditional: number; expiring: number; safety_critical_gap: boolean };
  requirements: DeploymentRequirement[];
  source?: 'cache' | 'live';
  error_class?: string;
}

/** One row of workforce_matrix (138). */
export interface MatrixRow {
  person_id: string;
  full_name: string;
  worker_type: string;
  engagement_type: string | null;
  lifecycle_status: string;
  primary_role_id: string | null;
  site_id: string | null;
  department_id: string | null;
  manager_id: string | null;
  result: DeploymentResult;
}
