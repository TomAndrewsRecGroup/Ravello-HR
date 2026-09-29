// Workforce vocabularies (Core-OS 360 Phase 3, migrations 132-138).
//
// Every tuple here mirrors a CHECK in the database; workforceVocab.test.ts
// reads the migrations and fails when the two disagree, in either
// direction. Labels are what people read; ids are what the database
// stores. Never write a literal that is not in one of these tuples.

export const DEPLOYMENT_STATUSES = ['READY', 'CONDITIONALLY_READY', 'NOT_READY', 'REVIEW_REQUIRED'] as const;
export type DeploymentStatus = typeof DEPLOYMENT_STATUSES[number];
export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, string> = {
  READY: 'Ready',
  CONDITIONALLY_READY: 'Conditionally ready',
  NOT_READY: 'Not ready',
  REVIEW_REQUIRED: 'Review required',
};
/** CSS variables only (CLAUDE.md: never hardcode colours). */
export const DEPLOYMENT_STATUS_COLOURS: Record<DeploymentStatus, string> = {
  READY: 'var(--teal)',
  CONDITIONALLY_READY: 'var(--gold)',
  NOT_READY: 'var(--red)',
  REVIEW_REQUIRED: 'var(--blue)',
};

/** One requirement's state inside a Safe to Deploy result (136 _wf_deployment). */
export const REQUIREMENT_STATUSES = ['met', 'expiring', 'met_with_restrictions', 'excepted', 'not_applicable', 'review', 'unmet'] as const;
export type RequirementStatus = typeof REQUIREMENT_STATUSES[number];
export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  met: 'Met',
  expiring: 'Expiring',
  met_with_restrictions: 'Met with restrictions',
  excepted: 'Exception in place',
  not_applicable: 'Not applicable',
  review: 'Awaiting verification',
  unmet: 'Not met',
};
export const REQUIREMENT_STATUS_COLOURS: Record<RequirementStatus, string> = {
  met: 'var(--teal)',
  expiring: 'var(--gold)',
  met_with_restrictions: 'var(--gold)',
  excepted: 'var(--gold)',
  not_applicable: 'var(--ink-faint)',
  review: 'var(--blue)',
  unmet: 'var(--red)',
};

/** 133 workforce_requirement_types(). */
export const REQUIREMENT_TYPES = ['training', 'competency', 'qualification', 'certification', 'licence', 'card', 'permit',
  'induction', 'medical', 'authorisation', 'ppe', 'document', 'pre_employment_check'] as const;
export type RequirementType = typeof REQUIREMENT_TYPES[number];
export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  training: 'Training',
  competency: 'Competency',
  qualification: 'Qualification',
  certification: 'Certification',
  licence: 'Licence',
  card: 'Card',
  permit: 'Permit',
  induction: 'Induction',
  medical: 'Occupational health',
  authorisation: 'Authorisation',
  ppe: 'PPE',
  document: 'Document',
  pre_employment_check: 'Pre-employment check',
};
/** Requirement types whose reference is a credential_types row, and the kind it must have. */
export const CREDENTIAL_KINDS = ['qualification', 'certification', 'licence', 'card', 'permit'] as const;
export type CredentialKind = typeof CREDENTIAL_KINDS[number];
/** The catalogue table each requirement type points at (document uses a key instead). */
export const REQUIREMENT_CATALOGUE: Record<Exclude<RequirementType, 'document'>, string> = {
  training: 'training_courses',
  competency: 'competencies',
  qualification: 'credential_types',
  certification: 'credential_types',
  licence: 'credential_types',
  card: 'credential_types',
  permit: 'credential_types',
  induction: 'induction_templates',
  medical: 'occupational_health_requirements',
  authorisation: 'authorisation_types',
  ppe: 'ppe_types',
  pre_employment_check: 'pre_employment_check_types',
};

/** 133 source_type on role/site/person requirements. */
export const REQUIREMENT_SOURCES = ['manual', 'incident', 'corrective_action', 'coshh', 'risk_assessment', 'clone', 'import'] as const;
export type RequirementSource = typeof REQUIREMENT_SOURCES[number];
export const REQUIREMENT_SOURCE_LABELS: Record<RequirementSource, string> = {
  manual: 'Added by hand', incident: 'From an incident', corrective_action: 'From a corrective action',
  coshh: 'From a COSHH assessment', risk_assessment: 'From a risk assessment', clone: 'Copied from another role', import: 'Imported',
};

/** 132 people.lifecycle_status. */
export const LIFECYCLE_STATUSES = ['prospect', 'candidate', 'offer', 'pre_employment', 'active', 'leave_of_absence',
  'notice', 'leaver', 'former_worker', 'archived'] as const;
export type LifecycleStatus = typeof LIFECYCLE_STATUSES[number];
export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  prospect: 'Prospect', candidate: 'Candidate', offer: 'Offer', pre_employment: 'Pre-employment', active: 'Active',
  leave_of_absence: 'Leave of absence', notice: 'Notice', leaver: 'Leaver', former_worker: 'Former worker', archived: 'Archived',
};

/** 132 people.engagement_type. */
export const ENGAGEMENT_TYPES = ['permanent', 'fixed_term', 'contractor', 'agency', 'casual', 'apprentice', 'consultant',
  'volunteer', 'trainee', 'temporary'] as const;
export type EngagementType = typeof ENGAGEMENT_TYPES[number];
export const ENGAGEMENT_LABELS: Record<EngagementType, string> = {
  permanent: 'Permanent', fixed_term: 'Fixed term', contractor: 'Contractor', agency: 'Agency', casual: 'Casual',
  apprentice: 'Apprentice', consultant: 'Consultant', volunteer: 'Volunteer', trainee: 'Trainee', temporary: 'Temporary',
};

export const WORKER_TYPE_LABELS: Record<string, string> = {
  employee: 'Employee', contractor: 'Contractor', consultant: 'Consultant', temporary_worker: 'Temporary worker',
  candidate: 'Candidate', athlete: 'Athlete', former_employee: 'Former employee',
};

/** 132 role_assignments.assignment_status. */
export const ASSIGNMENT_STATUSES = ['planned', 'active', 'ended'] as const;
export type AssignmentStatus = typeof ASSIGNMENT_STATUSES[number];

/** 133 job_roles.active_status. */
export const ROLE_STATUSES = ['draft', 'active', 'inactive'] as const;
export type RoleStatus = typeof ROLE_STATUSES[number];

/** 134 evidence verification. */
export const VERIFICATION_STATUSES = ['unverified', 'verified', 'rejected'] as const;
export type VerificationStatus = typeof VERIFICATION_STATUSES[number];
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Awaiting verification', verified: 'Verified', rejected: 'Rejected',
};

/** 134 training_records.result / source. */
export const TRAINING_RESULTS = ['pass', 'fail', 'attended'] as const;
export const TRAINING_SOURCES = ['manual', 'self', 'import', 'hs_test', 'elearning', 'session', 'consultant'] as const;

/** 134 person_competencies.assessment_method. */
export const ASSESSMENT_METHODS = ['practical_observation', 'external_certificate', 'assessment', 'supervisor_signoff',
  'qualification', 'logged_experience', 'competency_test'] as const;
export type AssessmentMethod = typeof ASSESSMENT_METHODS[number];
export const ASSESSMENT_METHOD_LABELS: Record<AssessmentMethod, string> = {
  practical_observation: 'Practical observation', external_certificate: 'External certificate', assessment: 'Assessment',
  supervisor_signoff: 'Supervisor sign-off', qualification: 'Qualification', logged_experience: 'Logged experience',
  competency_test: 'Competency test',
};

/** 134 training_attendance.status. */
export const ATTENDANCE_STATUSES = ['invited', 'attended', 'no_show', 'passed', 'failed', 'reschedule_required'] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];
export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  invited: 'Invited', attended: 'Attended', no_show: 'No show', passed: 'Passed', failed: 'Failed', reschedule_required: 'Reschedule',
};
/** 134 training_sessions.status. */
export const SESSION_STATUSES = ['planned', 'confirmed', 'completed', 'cancelled'] as const;

/** 134 pre_employment_checks.status. */
export const CHECK_STATUSES = ['required', 'requested', 'received', 'verified', 'failed', 'waived'] as const;
export type CheckStatus = typeof CHECK_STATUSES[number];
export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  required: 'Required', requested: 'Requested', received: 'Received', verified: 'Verified', failed: 'Failed', waived: 'Waived',
};

/** 134 requirement_exceptions.kind. */
export const EXCEPTION_KINDS = ['temporary_exception', 'waiver', 'not_applicable'] as const;
export type ExceptionKind = typeof EXCEPTION_KINDS[number];
export const EXCEPTION_KIND_LABELS: Record<ExceptionKind, string> = {
  temporary_exception: 'Temporary exception', waiver: 'Waiver', not_applicable: 'Not applicable',
};
/** 134: an exception lasts at most this many days. */
export const EXCEPTION_MAX_DAYS = 90;

/** 134 onboarding gates. */
export const ONBOARDING_GATES = ['none', 'before_start', 'before_unsupervised', 'within_days'] as const;
export type OnboardingGate = typeof ONBOARDING_GATES[number];
export const ONBOARDING_GATE_LABELS: Record<OnboardingGate, string> = {
  none: 'No gate', before_start: 'Before starting', before_unsupervised: 'Before unsupervised work', within_days: 'Within N days of starting',
};

/** 135 person_health_outcomes.outcome. Shown ONLY to occupational_health.summary.read holders or the person. */
export const HEALTH_OUTCOMES = ['fit', 'fit_with_restrictions', 'temporarily_unfit', 'unfit', 'further_assessment_required'] as const;
export type HealthOutcome = typeof HEALTH_OUTCOMES[number];
export const HEALTH_OUTCOME_LABELS: Record<HealthOutcome, string> = {
  fit: 'Fit', fit_with_restrictions: 'Fit with restrictions', temporarily_unfit: 'Temporarily unfit', unfit: 'Unfit',
  further_assessment_required: 'Further assessment required',
};

/** 133 training_courses.delivery_method (pinned to the migration by test). */
export const DELIVERY_METHODS = ['internal', 'external', 'classroom', 'elearning', 'practical', 'toolbox', 'certification', 'refresher'] as const;
export const DELIVERY_METHOD_LABELS: Record<typeof DELIVERY_METHODS[number], string> = {
  internal: 'Internal', external: 'External', classroom: 'Classroom', elearning: 'E-learning', practical: 'Practical',
  toolbox: 'Toolbox talk', certification: 'Certification', refresher: 'Refresher',
};
/** 133 occupational_health_requirements.category (pinned to the migration by test). */
export const OH_REQUIREMENT_CATEGORIES = ['audiometry', 'respiratory', 'havs', 'skin', 'night_worker', 'safety_critical_medical',
  'driver_medical', 'fitness_for_task', 'other'] as const;
export const OH_REQUIREMENT_CATEGORY_LABELS: Record<typeof OH_REQUIREMENT_CATEGORIES[number], string> = {
  audiometry: 'Audiometry', respiratory: 'Respiratory', havs: 'Hand-arm vibration', skin: 'Skin', night_worker: 'Night worker',
  safety_critical_medical: 'Safety-critical medical', driver_medical: 'Driver medical', fitness_for_task: 'Fitness for task', other: 'Other',
};

/** 134 induction_templates.scope. */
export const INDUCTION_SCOPES = ['company', 'site', 'project', 'department', 'contractor', 'role'] as const;
/** 134 authorisation_types.scope_kind. */
export const AUTHORISATION_SCOPE_KINDS = ['general', 'site', 'plant', 'equipment', 'voltage', 'permit'] as const;
/** 134 development_items.status. */
export const DEVELOPMENT_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;

export const WORKFORCE_BASE = '/lead/workforce';
export const workforcePersonPath = (id: string) => `${WORKFORCE_BASE}/people/${id}`;
export const workforceRolePath = (id: string) => `${WORKFORCE_BASE}/roles/${id}`;
